import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { GuideType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

/// How long an activation link stays usable.
const ACTIVATION_TTL_HOURS = 72;

/// Provisions provider accounts when an admin approves an application.
///
/// SECURITY POSTURE (Phase 14): no password is ever generated, stored in
/// plaintext, or emailed. Approval creates a user whose password is a
/// random unusable value with `mustSetPassword = true`, plus a single-use
/// activation token that only ever exists in plaintext inside the email.
/// The applicant sets their own password via POST /auth/activate, which
/// clears the flag and lets them sign in.
@Injectable()
export class AccountProvisioningService {
  private readonly logger = new Logger(AccountProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /// Hash used for both storage and lookup of activation tokens. SHA-256 is
  /// right here (not bcrypt): the token is already 256 bits of entropy, so
  /// it needs no work factor, and we must be able to look it up by hash.
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /// Creates (or re-uses) the user and guide profile for an approved
  /// application, then issues an activation token.
  ///
  /// Idempotent: approving an application whose user already exists
  /// re-issues a fresh activation link rather than creating a duplicate.
  async provisionForApplication(applicationId: string, reviewerId: string) {
    const application = await this.prisma.guideApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw new BadRequestException('Application not found.');

    const email = application.email.trim().toLowerCase();
    const token = randomBytes(32).toString('hex');
    const tokenHash = AccountProvisioningService.hashToken(token);
    const expiresAt = new Date(Date.now() + ACTIVATION_TTL_HOURS * 60 * 60 * 1000);

    const { user, guide } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        include: { guideProfile: true },
      });

      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              // Promote an existing tourist account to GUIDE rather than
              // creating a second account for the same person.
              role: UserRole.GUIDE,
              activationTokenHash: tokenHash,
              activationExpiresAt: expiresAt,
              // Only force a password reset if they never had a usable one.
              mustSetPassword: existing.mustSetPassword || !existing.emailVerified,
            },
          })
        : await tx.user.create({
            data: {
              email,
              fullName: application.fullName,
              phone: application.phone,
              nationality: application.nationality ?? 'Rwandan',
              role: UserRole.GUIDE,
              // Unusable placeholder — replaced when the applicant activates.
              password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
              emailVerified: true,
              mustSetPassword: true,
              activationTokenHash: tokenHash,
              activationExpiresAt: expiresAt,
            },
          });

      const guide =
        existing?.guideProfile ??
        (await tx.guideProfile.create({
          data: {
            userId: user.id,
            guideType: application.guideType,
            companyName:
              application.guideType === GuideType.COMPANY ? application.companyName : null,
            languages: application.languages,
            city: application.city,
            bio: application.bio,
            // Approval by an admin *is* the verification.
            isVerified: true,
            verifiedAt: new Date(),
          },
        }));

      // A gastronomy applicant needs a ChefProfile to hold courses and
      // price tiers. Created only if a category exists to attach it to —
      // the provider completes it from their own dashboard afterwards.
      if (application.wantsGastronomy) {
        const alreadyChef = await tx.chefProfile.findUnique({ where: { guideId: guide.id } });
        if (!alreadyChef) {
          const category = await tx.gastronomyCategory.findFirst({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          });
          if (category) {
            await tx.chefProfile.create({
              data: {
                guideId: guide.id,
                categoryId: category.id,
                restaurantName: application.companyName,
              },
            });
          } else {
            this.logger.warn(
              `Application ${applicationId} wanted gastronomy but no active GastronomyCategory exists; ChefProfile not created.`,
            );
          }
        }
      }

      await tx.guideApplication.update({
        where: { id: applicationId },
        data: {
          status: 'APPROVED',
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          createdUserId: user.id,
          guideId: guide.id,
        },
      });

      return { user, guide };
    });

    const emailStatus = await this.sendActivationEmail(
      email,
      application.fullName,
      token,
      applicationId,
    );

    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.ApplicationApproved,
      title: 'Your provider application was approved',
      message: 'Set your password using the activation link we emailed you, then sign in.',
      actionLabel: 'Activate account',
      actionUrl: '/auth/activate',
    });

    return { userId: user.id, guideId: guide.id, emailStatus };
  }

  /// Sends the activation email and records the delivery outcome on the
  /// application (Phase 14 requires an audit of account creation + email).
  private async sendActivationEmail(
    email: string,
    fullName: string,
    token: string,
    applicationId: string,
  ): Promise<string> {
    const frontend = (this.config.get<string>('FRONTEND_URL') ?? 'https://yoguide.africa').replace(
      /\/+$/,
      '',
    );
    const activationUrl = `${frontend}/activate?token=${token}`;
    let status = 'sent';
    try {
      await this.mail.sendGuideApprovalEmail(email, {
        fullName,
        activationUrl,
        expiresInHours: ACTIVATION_TTL_HOURS,
      });
    } catch (error) {
      status = `failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(`Activation email to ${email} failed: ${status}`);
    }
    await this.prisma.guideApplication.update({
      where: { id: applicationId },
      data: { approvalEmailSentAt: new Date(), approvalEmailStatus: status },
    });
    return status;
  }

  /// Completes activation: validates the token, sets the chosen password,
  /// and clears the one-time credentials. Returns the activated user.
  async activate(token: string, newPassword: string) {
    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    const tokenHash = AccountProvisioningService.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { activationTokenHash: tokenHash, activationExpiresAt: { gt: new Date() } },
    });
    if (!user) {
      throw new BadRequestException('This activation link is invalid or has expired.');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        mustSetPassword: false,
        emailVerified: true,
        activationTokenHash: null,
        activationExpiresAt: null,
      },
    });

    await this.notifications.notify({
      userId: updated.id,
      type: NotificationType.AccountActivated,
      title: 'Account activated',
      message: 'Your yoGuide provider account is active. Welcome aboard.',
    });

    return updated;
  }

  /// Rejects an application and tells the applicant why.
  async reject(applicationId: string, reviewerId: string, reason?: string) {
    const application = await this.prisma.guideApplication.update({
      where: { id: applicationId },
      data: {
        status: 'REJECTED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    try {
      await this.mail.sendApplicationRejectedEmail(application.email, {
        fullName: application.fullName,
        reason,
      });
    } catch (error) {
      this.logger.error(`Rejection email to ${application.email} failed: ${String(error)}`);
    }
    return application;
  }
}
