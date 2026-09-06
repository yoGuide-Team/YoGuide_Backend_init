import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { hoursBetween } from '../common/dates';

/// Cancellation policy, evaluated server-side only.
///
/// Expressed as ordered tiers: the first tier whose `minHoursBefore` is met
/// by the time remaining before the experience decides the refund. Values
/// are overridable by configuration so the business can change terms
/// without a code change, but never by a client request.
interface PolicyTier {
  rule: string;
  minHoursBefore: number;
  refundPercent: number;
}

const DEFAULT_POLICY: PolicyTier[] = [
  { rule: 'full_over_72h', minHoursBefore: 72, refundPercent: 100 },
  { rule: 'half_24_to_72h', minHoursBefore: 24, refundPercent: 50 },
  { rule: 'none_under_24h', minHoursBefore: 0, refundPercent: 0 },
];

export interface RefundQuote {
  eligible: boolean;
  rule: string;
  refundPercent: number;
  amount: Prisma.Decimal;
  currency: string;
  hoursUntilExperience: number;
  reason?: string;
}

/// Decides refund eligibility and amount, and records the refund.
///
/// The client never decides whether a refund is due, nor how much — it may
/// only ask for a quote (`quote`) or request a cancellation (`cancel`),
/// both of which are evaluated here against the policy and the *verified*
/// payment record.
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get policy(): PolicyTier[] {
    const raw = this.config.get<string>('CANCELLATION_POLICY_JSON');
    if (!raw) return DEFAULT_POLICY;
    try {
      const parsed = JSON.parse(raw) as PolicyTier[];
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_POLICY;
      return [...parsed].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
    } catch {
      this.logger.warn('CANCELLATION_POLICY_JSON is not valid JSON; using the default policy.');
      return DEFAULT_POLICY;
    }
  }

  /// What would be refunded if this booking were cancelled right now.
  /// Read-only — safe to show on a confirmation screen.
  async quote(bookingId: string, userId?: string): Promise<RefundQuote> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ...(userId ? { userId } : {}) },
      include: { payment: true, refunds: true },
    });
    if (!booking) throw new NotFoundException(`Booking '${bookingId}' not found.`);
    return this.computeQuote(booking);
  }

  private computeQuote(
    booking: Prisma.BookingGetPayload<{ include: { payment: true; refunds: true } }>,
  ): RefundQuote {
    const hours = hoursBetween(new Date(), booking.scheduleDate);
    const zero = new Prisma.Decimal(0);

    // Nothing verified as paid means nothing to refund — this is the case
    // for CASH bookings and for checkouts that were never completed.
    if (!booking.payment || booking.payment.status !== PaymentStatus.SUCCESSFUL) {
      return {
        eligible: false,
        rule: 'no_captured_payment',
        refundPercent: 0,
        amount: zero,
        currency: booking.currency,
        hoursUntilExperience: hours,
        reason: 'No captured payment to refund.',
      };
    }

    const alreadyRefunded = booking.payment.refundedAmount ?? zero;
    const paid = booking.payment.amount;
    const remaining = paid.sub(alreadyRefunded);
    if (remaining.lte(0)) {
      return {
        eligible: false,
        rule: 'already_refunded',
        refundPercent: 0,
        amount: zero,
        currency: booking.currency,
        hoursUntilExperience: hours,
        reason: 'This payment has already been fully refunded.',
      };
    }

    const tier =
      this.policy.find((t) => hours >= t.minHoursBefore) ??
      this.policy[this.policy.length - 1];

    const amount = paid.mul(tier.refundPercent).div(100);
    const capped = amount.gt(remaining) ? remaining : amount;

    return {
      eligible: capped.gt(0),
      rule: tier.rule,
      refundPercent: tier.refundPercent,
      amount: capped,
      currency: booking.currency,
      hoursUntilExperience: hours,
      ...(capped.gt(0)
        ? {}
        : { reason: `Cancellations within ${this.policy[this.policy.length - 1].minHoursBefore}–24 hours are non-refundable.` }),
    };
  }

  /// Cancels a booking and records any refund the policy allows.
  ///
  /// Availability is restored implicitly: CANCELLED is not a
  /// capacity-consuming status, so the slot frees the moment this commits.
  async cancelBooking(params: {
    bookingId: string;
    /// Present when a customer cancels; absent for admin/provider cancels.
    userId?: string;
    requestedById: string;
    reason?: string;
    /// Admin override — refund in full regardless of the time-based policy
    /// (used when the provider cancels, so the customer is not penalised).
    forceFullRefund?: boolean;
  }) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: params.bookingId, ...(params.userId ? { userId: params.userId } : {}) },
      include: { payment: true, refunds: true },
    });
    if (!booking) throw new NotFoundException(`Booking '${params.bookingId}' not found.`);

    // Only a live booking can be cancelled. DECLINED is included here: the
    // provider has already refused it, so there is nothing left to cancel —
    // this matches the CANCELLABLE = [PENDING, CONFIRMED] rule the previous
    // cancel route enforced.
    const cancellable: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.PROCESSING,
      BookingStatus.CONFIRMED,
    ];
    if (!cancellable.includes(booking.status)) {
      throw new BadRequestException(
        `A ${booking.status.toLowerCase()} booking cannot be cancelled.`,
      );
    }

    let quote = this.computeQuote(booking);
    if (params.forceFullRefund && booking.payment?.status === PaymentStatus.SUCCESSFUL) {
      const remaining = booking.payment.amount.sub(booking.payment.refundedAmount ?? 0);
      quote = {
        ...quote,
        eligible: remaining.gt(0),
        rule: 'provider_cancelled_full',
        refundPercent: 100,
        amount: remaining,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: params.reason,
          holdExpiresAt: null,
        },
      });

      if (!quote.eligible || !booking.payment) {
        return { booking: updatedBooking, refund: null };
      }

      const refund = await tx.refund.create({
        data: {
          bookingId: booking.id,
          paymentId: booking.payment.id,
          amount: quote.amount,
          currency: quote.currency,
          // PENDING, not COMPLETED: the money has not moved until the
          // provider confirms it. Marking it complete here would be a lie.
          status: RefundStatus.PENDING,
          policyRule: quote.rule,
          reason: params.reason,
          requestedById: params.requestedById,
        },
      });

      const newRefundedTotal = (booking.payment.refundedAmount ?? new Prisma.Decimal(0)).add(
        quote.amount,
      );
      await tx.payment.update({
        where: { id: booking.payment.id },
        data: {
          refundedAmount: newRefundedTotal,
          status: newRefundedTotal.gte(booking.payment.amount)
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });

      return { booking: updatedBooking, refund };
    });

    await this.announce(booking.id, quote, result.refund?.id);
    return { booking: result.booking, refund: result.refund, quote };
  }

  /// Marks a refund as settled once it has actually been paid out. Called
  /// by an admin after reconciling with the provider — never automatically.
  async markProcessed(refundId: string, providerRef?: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException(`Refund '${refundId}' not found.`);
    if (refund.status === RefundStatus.COMPLETED) return refund;
    return this.prisma.refund.update({
      where: { id: refundId },
      data: { status: RefundStatus.COMPLETED, processedAt: new Date(), providerRef },
    });
  }

  private async announce(bookingId: string, quote: RefundQuote, refundId?: string) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          guide: { select: { userId: true } },
          package: { select: { name: true } },
        },
      });
      if (!booking) return;

      const label = booking.package?.name ?? 'your yoGuide experience';
      const when = booking.scheduleDate.toISOString().slice(0, 10);
      const refundSummary = quote.eligible
        ? `${quote.currency} ${quote.amount.toString()} (${quote.refundPercent}%)`
        : (quote.reason ?? 'No refund due under the cancellation policy.');

      await this.notifications.notify({
        userId: booking.userId,
        type: NotificationType.BookingCancelled,
        title: 'Booking cancelled',
        message: `${label} on ${when} was cancelled. Refund: ${refundSummary}`,
        transactionId: booking.id,
      });

      if (booking.guide?.userId) {
        await this.notifications.notify({
          userId: booking.guide.userId,
          type: NotificationType.ProviderBookingCancelled,
          title: 'A booking was cancelled',
          message: `${label} on ${when} was cancelled. The date is available again.`,
          transactionId: booking.id,
        });
      }

      await this.mail.sendBookingCancelledEmail(booking.user.email, {
        customerName: booking.user.fullName ?? 'there',
        experience: label,
        date: when,
        reference: booking.reference ?? booking.id,
        refundSummary,
      });

      if (quote.eligible && refundId) {
        await this.notifications.notify({
          userId: booking.userId,
          type: NotificationType.RefundIssued,
          title: 'Refund issued',
          message: `A refund of ${quote.currency} ${quote.amount.toString()} is being processed.`,
          transactionId: refundId,
        });
        await this.mail.sendRefundIssuedEmail(booking.user.email, {
          customerName: booking.user.fullName ?? 'there',
          amount: `${quote.currency} ${quote.amount.toString()}`,
          reference: booking.reference ?? booking.id,
        });
      }
    } catch (error) {
      this.logger.error(`Cancellation announcement failed for booking ${bookingId}: ${String(error)}`);
    }
  }
}
