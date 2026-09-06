import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { generateShortCode } from '../common/short-code';
import { YoEcoPayClient, SettlementOutcome } from './yoecopay.client';

/// How long a booking holds its capacity slot while payment is in flight.
const PAYMENT_HOLD_MINUTES = 30;

/// Booking payments.
///
/// The one rule this service exists to enforce: **the client never declares
/// a payment outcome.** A caller may ask us to start a payment, and may ask
/// us to check on one, but the status written to the database always comes
/// from a server-to-server read of the provider. The previous
/// `POST /bookings/:id/payment` route, which wrote whatever `status` the
/// request body contained, has been removed.
@Injectable()
export class BookingPaymentsService {
  private readonly logger = new Logger(BookingPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: YoEcoPayClient,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ── Initiation ─────────────────────────────────────────────

  /// Starts a payment for one of the caller's own bookings.
  ///
  /// Idempotent on `idempotencyKey`: repeating a request with the same key
  /// returns the original attempt instead of opening a second checkout
  /// session, so a retried or double-tapped request cannot double-charge.
  async initiate(params: {
    userId: string;
    bookingId: string;
    method: PaymentMethod;
    idempotencyKey?: string;
    customerPhone?: string;
  }) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: params.bookingId, userId: params.userId },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true } }, payment: true },
    });
    if (!booking) throw new NotFoundException(`Booking '${params.bookingId}' not found.`);

    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.EXPIRED) {
      throw new ConflictException(`A ${booking.status.toLowerCase()} booking cannot be paid for.`);
    }
    if (booking.payment?.status === PaymentStatus.SUCCESSFUL) {
      throw new ConflictException('This booking is already paid.');
    }

    if (params.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        if (existing.bookingId !== booking.id) {
          throw new ConflictException('This idempotency key was already used for another booking.');
        }
        return this.toWire(existing, booking.id, null);
      }
    }

    // Cash is settled in person by the provider — no gateway involved, and
    // it must not confirm the booking. It stays PENDING until the provider
    // confirms, exactly as before.
    if (params.method === PaymentMethod.CASH) {
      const payment = await this.upsertPayment(booking.id, {
        amount: booking.totalDue,
        currency: booking.currency,
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        provider: 'cash',
        idempotencyKey: params.idempotencyKey,
      });
      return this.toWire(payment, booking.id, null);
    }

    if (!this.provider.isConfigured) {
      throw new ServiceUnavailableException(
        'Online payments are not configured on this server. ' +
          'Set YOECOPAY_WORKER_BASE and YOECOPAY_APP_SECRET, or pay with method CASH.',
      );
    }

    const amountRwf = this.toProviderAmount(booking.totalDue, booking.currency);
    const customerRef = `YG-${booking.id.slice(0, 8).toUpperCase()}-${Date.now()}`;
    const phone = params.customerPhone ?? booking.user.phone;
    if (!phone) {
      throw new BadRequestException(
        'A phone number is required to start an online payment. Add one to your profile or send customerPhone.',
      );
    }

    const payment = await this.upsertPayment(booking.id, {
      amount: booking.totalDue,
      currency: booking.currency,
      status: PaymentStatus.PROCESSING,
      paymentMethod: params.method,
      provider: 'xentripay',
      transactionRef: customerRef,
      idempotencyKey: params.idempotencyKey,
    });

    const { session, call } = await this.provider.createCheckout({
      customerName: booking.user.fullName ?? 'yoGuide customer',
      customerPhone: phone,
      customerEmail: booking.user.email,
      amount: amountRwf,
      customerRef,
    });

    await this.recordAttempt(payment.id, 'initiate', {
      providerRef: session.sessionId || null,
      resultStatus: session.status,
      httpStatus: call.httpStatus,
      responseBody: call.raw,
      errorMessage: call.error,
    });

    if (!call.ok || !session.sessionId) {
      const failed = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: call.error ?? 'Provider did not open a checkout session.',
        },
      });
      throw new ServiceUnavailableException(
        failed.failureReason ?? 'Could not start the payment. Please try again.',
      );
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: session.sessionId, providerStatus: session.status },
    });

    // Hold the capacity slot while the customer completes the checkout.
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.PROCESSING,
        paymentMethod: params.method,
        holdExpiresAt: new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000),
      },
    });

    return this.toWire(updated, booking.id, session.redirectUrl);
  }

  // ── Verification ───────────────────────────────────────────

  /// Reads the authoritative outcome from the provider and applies it.
  ///
  /// Safe to call repeatedly and from anywhere (client poll, webhook,
  /// scheduled sweep) — applying an already-applied outcome is a no-op.
  async verify(bookingId: string, requestingUserId?: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ...(requestingUserId ? { userId: requestingUserId } : {}) },
      include: { payment: true, guide: { select: { id: true, userId: true } } },
    });
    if (!booking) throw new NotFoundException(`Booking '${bookingId}' not found.`);
    if (!booking.payment) throw new NotFoundException('No payment has been started for this booking.');

    const payment = booking.payment;

    // Terminal states are never re-read from the provider.
    if (
      payment.status === PaymentStatus.SUCCESSFUL ||
      payment.status === PaymentStatus.REFUNDED ||
      payment.status === PaymentStatus.PARTIALLY_REFUNDED
    ) {
      return this.toWire(payment, booking.id, null);
    }
    if (payment.provider === 'cash') {
      return this.toWire(payment, booking.id, null);
    }
    if (!payment.providerRef) {
      throw new ConflictException('This payment has no provider reference to verify.');
    }

    const { outcome, providerStatus, call } = await this.provider.getCheckoutStatus(payment.providerRef);
    await this.recordAttempt(payment.id, 'verify', {
      providerRef: payment.providerRef,
      resultStatus: providerStatus,
      httpStatus: call.httpStatus,
      responseBody: call.raw,
      errorMessage: call.error,
    });

    if (!call.ok) {
      // Provider unreachable — leave the payment where it is. Reporting a
      // failure here would wrongly release the slot on a transient outage.
      throw new ServiceUnavailableException(
        'Could not reach the payment provider to verify this payment. Please try again shortly.',
      );
    }

    return this.applyOutcome(booking.id, outcome, providerStatus);
  }

  /// Applies a verified provider outcome to the payment and booking, in one
  /// transaction, then fires notifications and email.
  async applyOutcome(
    bookingId: string,
    outcome: SettlementOutcome,
    providerStatus: string | null,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { payment: true, user: { select: { id: true, email: true, fullName: true } } },
      });
      if (!booking?.payment) throw new NotFoundException(`Booking '${bookingId}' not found.`);
      if (booking.payment.status === PaymentStatus.SUCCESSFUL) {
        return { booking, payment: booking.payment, changed: false };
      }

      if (outcome === 'SUCCESSFUL') {
        const payment = await tx.payment.update({
          where: { id: booking.payment.id },
          data: {
            status: PaymentStatus.SUCCESSFUL,
            providerStatus,
            verifiedAt: new Date(),
            failureReason: null,
          },
        });
        const updatedBooking = await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.CONFIRMED,
            holdExpiresAt: null,
            reference: booking.reference ?? `YG-${generateShortCode(8)}`,
          },
          include: { user: { select: { id: true, email: true, fullName: true } } },
        });
        return { booking: updatedBooking, payment, changed: true };
      }

      if (outcome === 'PENDING') {
        const payment = await tx.payment.update({
          where: { id: booking.payment.id },
          data: { providerStatus },
        });
        return { booking, payment, changed: false };
      }

      // FAILED / CANCELLED / EXPIRED — release the held slot.
      const status =
        outcome === 'CANCELLED'
          ? PaymentStatus.CANCELLED
          : outcome === 'EXPIRED'
            ? PaymentStatus.EXPIRED
            : PaymentStatus.FAILED;
      const payment = await tx.payment.update({
        where: { id: booking.payment.id },
        data: {
          status,
          providerStatus,
          failureReason: providerStatus ?? outcome,
        },
      });
      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: outcome === 'EXPIRED' ? BookingStatus.EXPIRED : BookingStatus.PENDING,
          holdExpiresAt: null,
        },
        include: { user: { select: { id: true, email: true, fullName: true } } },
      });
      return { booking: updatedBooking, payment, changed: true };
    });

    if (result.changed) {
      await this.announce(bookingId, result.payment.status);
    }
    return this.toWire(result.payment, bookingId, null);
  }

  // ── Side effects ───────────────────────────────────────────

  /// Notifies customer and provider, and emails the customer. Never throws
  /// into the payment flow — a failed email must not un-confirm a booking.
  private async announce(bookingId: string, status: PaymentStatus) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          guide: { select: { id: true, userId: true, companyName: true } },
          package: { select: { name: true } },
        },
      });
      if (!booking) return;

      const label = booking.package?.name ?? 'your yoGuide experience';
      const when = booking.scheduleDate.toISOString().slice(0, 10);

      if (status === PaymentStatus.SUCCESSFUL) {
        await this.notifications.notify({
          userId: booking.userId,
          type: NotificationType.PaymentSucceeded,
          title: 'Payment confirmed',
          message: `Your booking for ${label} on ${when} is confirmed. Reference ${booking.reference ?? ''}.`,
          transactionId: booking.id,
          actionLabel: 'View booking',
          actionUrl: `/bookings/${booking.id}`,
        });
        if (booking.guide?.userId) {
          await this.notifications.notify({
            userId: booking.guide.userId,
            type: NotificationType.ProviderNewBooking,
            title: 'New confirmed booking',
            message: `${booking.user.fullName ?? 'A customer'} booked ${label} for ${when}.`,
            transactionId: booking.id,
            actionLabel: 'View booking',
            actionUrl: `/guide/bookings/${booking.id}`,
          });
        }
        await this.mail.sendBookingConfirmationEmail(booking.user.email, {
          customerName: booking.user.fullName ?? 'there',
          experience: label,
          date: when,
          reference: booking.reference ?? booking.id,
          total: `${booking.currency} ${booking.totalDue.toString()}`,
        });
      } else {
        await this.notifications.notify({
          userId: booking.userId,
          type: NotificationType.PaymentFailed,
          title: 'Payment not completed',
          message: `We could not confirm payment for ${label}. Your booking is still held as ${booking.status.toLowerCase()}.`,
          transactionId: booking.id,
          actionLabel: 'Try again',
          actionUrl: `/bookings/${booking.id}`,
        });
      }
    } catch (error) {
      this.logger.error(`Post-payment announcement failed for booking ${bookingId}: ${String(error)}`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private async upsertPayment(
    bookingId: string,
    data: {
      amount: Prisma.Decimal;
      currency: string;
      status: PaymentStatus;
      paymentMethod: PaymentMethod;
      provider: string;
      transactionRef?: string;
      idempotencyKey?: string;
    },
  ) {
    return this.prisma.payment.upsert({
      where: { bookingId },
      create: { bookingId, ...data },
      update: {
        status: data.status,
        paymentMethod: data.paymentMethod,
        provider: data.provider,
        transactionRef: data.transactionRef,
        ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
        failureReason: null,
      },
    });
  }

  private async recordAttempt(
    paymentId: string,
    action: string,
    fields: {
      providerRef?: string | null;
      resultStatus?: string | null;
      httpStatus?: number | null;
      responseBody?: string | null;
      errorMessage?: string | null;
    },
  ) {
    try {
      await this.prisma.paymentAttempt.create({
        data: {
          paymentId,
          action,
          providerRef: fields.providerRef ?? undefined,
          resultStatus: fields.resultStatus ?? undefined,
          httpStatus: fields.httpStatus ?? undefined,
          responseBody: fields.responseBody ?? undefined,
          errorMessage: fields.errorMessage ?? undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Could not record payment attempt: ${String(error)}`);
    }
  }

  /// Bookings are priced in USD; the provider settles in RWF. The rate is
  /// configuration, never a client input. Missing configuration is an error
  /// rather than a guessed rate — charging the wrong amount is worse than
  /// refusing to charge.
  private toProviderAmount(amount: Prisma.Decimal, currency: string): number {
    if (currency === 'RWF') return Math.round(Number(amount));
    const rate = Number(this.config.get<string>('USD_TO_RWF_RATE') ?? '');
    if (!rate || Number.isNaN(rate) || rate <= 0) {
      throw new ServiceUnavailableException(
        `Cannot charge a ${currency} booking: set USD_TO_RWF_RATE so the amount can be converted to the provider's currency (RWF).`,
      );
    }
    return Math.round(Number(amount) * rate);
  }

  private toWire(payment: { id: string; status: PaymentStatus; amount: Prisma.Decimal; currency: string; paymentMethod: PaymentMethod; provider: string | null; providerRef: string | null; providerStatus: string | null; transactionRef: string | null; verifiedAt: Date | null; failureReason: string | null }, bookingId: string, redirectUrl: string | null) {
    return {
      id: payment.id,
      bookingId,
      status: payment.status,
      amount: payment.amount.toString(),
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      provider: payment.provider,
      providerRef: payment.providerRef,
      providerStatus: payment.providerStatus,
      transactionRef: payment.transactionRef,
      verifiedAt: payment.verifiedAt?.toISOString() ?? null,
      failureReason: payment.failureReason,
      redirectUrl,
    };
  }
}
