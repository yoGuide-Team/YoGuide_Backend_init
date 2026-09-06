import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// Stable `type` values so clients can branch on them without parsing copy.
export const NotificationType = {
  BookingCreated: 'booking.created',
  BookingConfirmed: 'booking.confirmed',
  BookingDeclined: 'booking.declined',
  BookingCancelled: 'booking.cancelled',
  BookingCompleted: 'booking.completed',
  BookingReminder: 'booking.reminder',
  PaymentSucceeded: 'payment.succeeded',
  PaymentFailed: 'payment.failed',
  RefundIssued: 'refund.issued',
  ProviderNewBooking: 'provider.booking.new',
  ProviderBookingCancelled: 'provider.booking.cancelled',
  ApplicationApproved: 'application.approved',
  ApplicationRejected: 'application.rejected',
  AccountActivated: 'account.activated',
} as const;

export type NotificationTypeValue =
  (typeof NotificationType)[keyof typeof NotificationType];

interface NotifyInput {
  userId: string;
  title: string;
  message?: string;
  type: NotificationTypeValue;
  transactionId?: string;
  actionLabel?: string;
  actionUrl?: string;
}

/// Writes the in-app notification feed. Until this existed the Notification
/// table was read-only in practice — `GET /notifications` always returned an
/// empty list because nothing but the admin broadcast ever inserted a row.
///
/// Every notification is addressed to exactly one `userId`, which is what
/// keeps provider feeds isolated: a booking event notifies the customer's
/// user id and the provider's *own* user id, never a provider list.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Create one notification. Never throws into the caller's flow — a
  /// failed notification must not roll back a confirmed booking or a
  /// settled payment, so failures are logged and swallowed.
  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          title: input.title,
          message: input.message,
          type: input.type,
          transactionId: input.transactionId,
          actionLabel: input.actionLabel,
          actionUrl: input.actionUrl,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write notification '${input.type}' for user ${input.userId}: ${String(error)}`,
      );
    }
  }

  async notifyMany(inputs: NotifyInput[]): Promise<void> {
    await Promise.all(inputs.map((i) => this.notify(i)));
  }

  /// Resolves a GuideProfile id to the owning user id, so provider-facing
  /// notifications land in that provider's own feed and nobody else's.
  async userIdForGuide(guideId: string): Promise<string | null> {
    const guide = await this.prisma.guideProfile.findUnique({
      where: { id: guideId },
      select: { userId: true },
    });
    return guide?.userId ?? null;
  }

  /// Marks one of the caller's own notifications read. Scoped by userId, so
  /// a caller can never mark someone else's notification read.
  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return result.count > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  /// Used inside a transaction that has already been committed elsewhere —
  /// exposes the raw create for callers that manage their own tx client.
  async notifyWithClient(tx: Prisma.TransactionClient, input: NotifyInput): Promise<void> {
    await tx.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        transactionId: input.transactionId,
        actionLabel: input.actionLabel,
        actionUrl: input.actionUrl,
      },
    });
  }
}
