import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { AuthenticatedUser } from './authenticated-user';
import type { UpdateProfileDto, UserProfileResponse } from './dto';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthSession {
  access_token: string;
  user: AuthenticatedUser;
}

export interface RegisterResult {
  requiresVerification: boolean;
  email: string;
  message: string;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly googleClientId: string;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.googleClientId =
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() ||
      '';
    this.googleClient = new OAuth2Client(this.googleClientId || undefined);
  }

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    nationality: string;
    phone?: string;
  }): Promise<RegisterResult> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists. Please log in.');
    }

    const password = await bcrypt.hash(input.password, 10);
    const { code, codeHash, expiresAt } = this.generateOtp();

    const user = await this.prisma.user.create({
      data: {
        email,
        password,
        fullName: input.fullName.trim(),
        nationality: input.nationality.trim(),
        phone: input.phone?.trim(),
        role: UserRole.TOURIST,
        emailVerified: false,
        otpCodeHash: codeHash,
        otpExpiresAt: expiresAt,
      },
    });

    this.logger.log(`REGISTRATION OTP: ${code} for ${user.email}`);
    await this.mailService.sendOtpEmail(user.email, code);

    return {
      requiresVerification: true,
      email: user.email,
      message:
        'Registration successful. Please enter the verification code sent to your email.',
    };
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account found with this email. Please sign up first.');
    }

    const ok = await bcrypt.compare(input.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // A provisioned-but-unclaimed provider account (created when an admin
    // approved an application) has an unusable random password and must be
    // activated through the emailed link before it can sign in. Refusing
    // here is what stops such an account being usable before its owner
    // has proved they control the mailbox.
    if (user.mustSetPassword) {
      throw new UnauthorizedException(
        'ACCOUNT_NOT_ACTIVATED: Use the activation link we emailed you to set your password.',
      );
    }

    if (!user.emailVerified) {
      await this.resendOtpForUser(user);
      throw new UnauthorizedException(
        'EMAIL_NOT_VERIFIED: Your email is not verified. A new verification code has been sent to your email.',
      );
    }

    return this.buildSession(user.id);
  }

  async verifyRegisterOtp(email: string, code: string): Promise<AuthSession> {
    if (!email?.trim()) throw new BadRequestException('Email is required.');
    if (!code?.trim()) throw new BadRequestException('OTP code is required.');

    const targetEmail = email.trim().toLowerCase();
    const codeHash = createHash('sha256').update(code.trim()).digest('hex');

    // Dev-mode bypass: in development, accept any 6-digit code for unverified users
    const isDev = process.env.NODE_ENV !== 'production';
    let user;

    if (isDev) {
      // In dev mode, find user by email with any pending OTP — accept any code
      user = await this.prisma.user.findFirst({
        where: { email: targetEmail, otpCodeHash: { not: null } },
      });
      if (user) {
        this.logger.log(`DEV MODE: OTP bypass accepted for ${targetEmail}`);
      }
    } else {
      // Production: strict hash + expiry check
      user = await this.prisma.user.findFirst({
        where: {
          email: targetEmail,
          otpCodeHash: codeHash,
          otpExpiresAt: { gt: new Date() },
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, otpCodeHash: null, otpExpiresAt: null },
    });

    return this.buildSession(user.id);
  }

  async sendOtpByEmail(email: string) {
    if (!email?.trim()) throw new BadRequestException('Email is required.');

    const targetEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: targetEmail } });

    if (!user) {
      return { message: 'If an account exists for that email, a code has been sent.' };
    }

    if (user.emailVerified) {
      return { message: 'This email is already verified. You can log in directly.' };
    }

    await this.resendOtpForUser(user);
    return { message: 'Verification code sent.' };
  }

  async loginWithGoogle(token: string): Promise<AuthSession> {
    if (!this.googleClientId) {
      throw new UnauthorizedException('Google Sign-In is not configured on this server.');
    }

    const idToken = token?.trim();
    if (!idToken) {
      throw new HttpException(
        { message: 'Google authentication failed', error: 'Google token is required.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { googleId, email, name, picture } = await this.verifyGoogleToken(idToken);
    const normalizedEmail = email.toLowerCase();

    let user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (user) {
      if (!user.googleId || !user.emailVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            profileImage: user.profileImage ?? picture ?? null,
            emailVerified: true,
          },
        });
      }
    } else {
      const placeholderPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const safeName =
        name?.trim() ||
        normalizedEmail.split('@')[0].replace(/^[a-z]/, (c) => c.toUpperCase());

      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          password: placeholderPassword,
          fullName: safeName,
          nationality: 'Unknown',
          profileImage: picture ?? null,
          googleId,
          role: UserRole.TOURIST,
          emailVerified: true,
        },
      });
    }

    return this.buildSession(user.id);
  }

  async forgotPassword(email: string) {
    const targetEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: targetEmail } });

    if (!user) {
      return {
        message: 'If an account exists for that email, a verification code has been sent.',
      };
    }

    const { code, codeHash, expiresAt } = this.generateOtp();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: codeHash,
        passwordResetExpiresAt: expiresAt,
      },
    });

    this.logger.log(`PASSWORD RESET OTP: ${code} for ${user.email}`);
    await this.mailService.sendPasswordResetOtpEmail(user.email, code);

    return {
      message: 'If an account exists for that email, a verification code has been sent.',
    };
  }

  async verifyResetOtp(email: string, code: string) {
    if (!email?.trim()) throw new BadRequestException('Email is required.');
    if (!code?.trim()) throw new BadRequestException('OTP code is required.');

    const targetEmail = email.trim().toLowerCase();
    const codeHash = createHash('sha256').update(code.trim()).digest('hex');

    // Dev-mode bypass: in development, accept any code for users with pending reset
    const isDev = process.env.NODE_ENV !== 'production';
    let user;

    if (isDev) {
      user = await this.prisma.user.findFirst({
        where: { email: targetEmail, passwordResetToken: { not: null } },
      });
      if (user) {
        this.logger.log(`DEV MODE: Password reset OTP bypass accepted for ${targetEmail}`);
      }
    } else {
      user = await this.prisma.user.findFirst({
        where: {
          email: targetEmail,
          passwordResetToken: codeHash,
          passwordResetExpiresAt: { gt: new Date() },
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });

    return {
      email: user.email,
      resetToken,
      message: 'OTP verified. You may now set a new password.',
    };
  }

  async resetPassword(resetToken: string, password: string) {
    const tokenHash = createHash('sha256').update(resetToken.trim()).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset session. Please request a new code.');
    }

    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    return { message: 'Password reset successful.' };
  }

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { currentRegion: { select: { id: true, name: true } } },
    });
    if (!user) throw new NotFoundException('User not found.');
    return this.toProfileResponse(user);
  }

  async updateProfile(userId: string, input: UpdateProfileDto): Promise<UserProfileResponse> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('User not found.');

    if (input.email) {
      const email = input.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
      });
      if (clash) throw new ConflictException('Email already in use.');
    }

    if (input.currentRegionId) {
      const region = await this.prisma.region.findUnique({
        where: { id: input.currentRegionId },
      });
      if (!region) {
        throw new NotFoundException(`Region '${input.currentRegionId}' not found.`);
      }
    }

    const data: Record<string, unknown> = {};
    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.email !== undefined) data.email = input.email.trim().toLowerCase();
    if (input.phone !== undefined) data.phone = input.phone.trim();
    if (input.nationality !== undefined) data.nationality = input.nationality.trim();
    if (input.visitorType !== undefined) data.visitorType = input.visitorType;
    if (input.profileImage !== undefined) data.profileImage = input.profileImage;
    if (input.arrivalDate !== undefined) data.arrivalDate = new Date(input.arrivalDate);
    if (input.departureDate !== undefined) data.departureDate = new Date(input.departureDate);
    if (input.defaultLanguage !== undefined) data.defaultLanguage = input.defaultLanguage;
    if (input.currentRegionId !== undefined) data.currentRegionId = input.currentRegionId;
    if (input.inAppNotifications !== undefined) data.inAppNotifications = input.inAppNotifications;
    if (input.emailNotifications !== undefined) data.emailNotifications = input.emailNotifications;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { currentRegion: { select: { id: true, name: true } } },
    });
    return this.toProfileResponse(user);
  }

  /// Distinct from updateProfile — password changes require proving
  /// knowledge of the current password first. (A prior version let a bare
  /// JWT silently overwrite the password via PATCH /auth/me with no
  /// current-password check; that field has been removed from
  /// UpdateProfileDto.)
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  }

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
    return this.loadAuthenticatedUser(payload.sub);
  }

  private generateOtp() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return { code, codeHash, expiresAt };
  }

  private async resendOtpForUser(user: User) {
    const { code, codeHash, expiresAt } = this.generateOtp();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCodeHash: codeHash, otpExpiresAt: expiresAt },
    });
    this.logger.log(`RESENT OTP: ${code} for ${user.email}`);
    await this.mailService.sendOtpEmail(user.email, code);
  }

  private async verifyGoogleToken(idToken: string) {
    const audience = this.googleClientId;
    const looksLikeJwt = idToken.split('.').length === 3;

    if (looksLikeJwt) {
      try {
        const ticket = await this.googleClient.verifyIdToken({ idToken, audience });
        const payload = ticket.getPayload();
        if (!payload?.email || !payload.sub) {
          throw new UnauthorizedException('Google token is missing required fields.');
        }
        return {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name ?? payload.given_name,
          picture: payload.picture,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid Google ID token.';
        throw new HttpException(
          { message: 'Google authentication failed', error: message },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) {
      throw new HttpException(
        { message: 'Google authentication failed', error: 'Invalid Google access token.' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const info = (await res.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };
    if (!info.email || !info.sub) {
      throw new UnauthorizedException('Google token is missing required fields.');
    }
    return {
      googleId: info.sub,
      email: info.email,
      name: info.name,
      picture: info.picture,
    };
  }

  private permissionsForRole(role: UserRole): string[] {
    if (role === UserRole.ADMIN) return ['*'];
    if (role === UserRole.GUIDE) {
      return ['guides.read', 'guides.write', 'bookings.read'];
    }
    return [];
  }

  private async buildSession(userId: string): Promise<AuthSession> {
    const user = await this.loadAuthenticatedUser(userId);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.roleKey as UserRole,
    };
    const access_token = await this.jwt.signAsync(payload);
    return { access_token, user };
  }

  private async loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roleKey: user.role,
      roleLabel: user.role,
      permissions: this.permissionsForRole(user.role),
      emailVerified: user.emailVerified,
    };
  }

  private toProfileResponse(
    user: User & { currentRegion?: { id: string; name: string } | null },
  ): UserProfileResponse {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      nationality: user.nationality,
      role: user.role,
      emailVerified: user.emailVerified,
      visitorType: user.visitorType,
      profileImage: user.profileImage,
      arrivalDate: user.arrivalDate,
      departureDate: user.departureDate,
      defaultLanguage: user.defaultLanguage,
      currentRegionId: user.currentRegionId,
      currentRegion: user.currentRegion ?? null,
      inAppNotifications: user.inAppNotifications,
      emailNotifications: user.emailNotifications,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
