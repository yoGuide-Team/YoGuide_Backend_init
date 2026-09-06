import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { generateShortCode } from '../common/short-code';
import { YoEcoPayClient } from './yoecopay.client';

/// Shows enough of a number to recognise it, not enough to reuse it.
export function maskMsisdn(msisdn: string): string {
  const digits = msisdn.replace(/[^0-9]/g, '');
  if (digits.length <= 4) return '•'.repeat(digits.length);
  return `${'•'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}

/// Money going **out** to a provider.
///
/// The whole point of this service is that the destination is never supplied
/// by a caller. A client names a provider — by id or by their short public
/// payment code — and the server looks up where that provider's money
/// actually goes. Before this existed the app called the payout worker
/// directly with a hardcoded product id, and the worker paid a phone number
/// written into its own source.
@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: YoEcoPayClient,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /// Public lookup for a provider's payment code — what a QR encodes.
  ///
  /// Deliberately thin: a display name and a **masked** number, enough for a
  /// payer to confirm they are paying the right person and for the app to
  /// pre-fill the payee, and nothing that would let a caller harvest
  /// provider phone numbers by enumerating codes.
  async resolvePaymentCode(code: string) {
    const normalised = code.trim().toUpperCase();
    if (!normalised) throw new BadRequestException('A payment code is required.');

    const guide = await this.prisma.guideProfile.findUnique({
      where: { paymentCode: normalised },
      include: {
        user: { select: { fullName: true } },
        chefProfile: { select: { restaurantName: true } },
      },
    });
    if (!guide) throw new NotFoundException('No provider found for that payment code.');
    if (!guide.isVerified) {
      throw new BadRequestException('This provider is not verified and cannot be paid yet.');
    }
    if (!guide.payoutVerified || !guide.payoutMsisdn) {
      throw new BadRequestException(
        'This provider has not completed their payout setup yet.',
      );
    }

    return {
      guideId: guide.id,
      paymentCode: guide.paymentCode,
      displayName:
        guide.chefProfile?.restaurantName ??
        guide.companyName ??
        guide.user.fullName,
      payoutNameMasked: guide.payoutName ?? null,
      // Masked, never the full number.
      msisdnMasked: maskMsisdn(guide.payoutMsisdn),
      isVerified: guide.isVerified,
    };
  }

  /// Sends a payout to a provider.
  ///
  /// `amount` is validated but the *destination* is resolved here, from the
  /// provider record — a caller cannot redirect money by passing a number.
  async payProvider(params: {
    guideId: string;
    amountRwf: number;
    requestedById?: string;
    bookingId?: string;
    note?: string;
  }) {
    const { guideId, amountRwf } = params;

    if (!Number.isFinite(amountRwf) || amountRwf <= 0) {
      throw new BadRequestException('amount must be a positive number.');
    }
    const maxPayout = Number(this.config.get<string>('MAX_PAYOUT_RWF') ?? '2000000');
    if (amountRwf > maxPayout) {
      // A ceiling that a bug or a compromised admin token cannot walk past
      // in one call.
      throw new BadRequestException(
        `Payouts above ${maxPayout} RWF must be made manually.`,
      );
    }

    const guide = await this.prisma.guideProfile.findUnique({
      where: { id: guideId },
      select: {
        id: true,
        userId: true,
        payoutMsisdn: true,
        payoutName: true,
        payoutTelecomId: true,
        payoutVerified: true,
        isVerified: true,
        companyName: true,
        user: { select: { fullName: true } },
      },
    });
    if (!guide) throw new NotFoundException(`Provider '${guideId}' not found.`);
    if (!guide.payoutMsisdn || !guide.payoutVerified) {
      throw new ConflictException(
        'This provider has no verified payout number. An admin must confirm it first.',
      );
    }
    if (!this.provider.isConfigured) {
      throw new ServiceUnavailableException(
        'Payouts are not configured on this server. Set YOECOPAY_WORKER_BASE and YOECOPAY_APP_SECRET.',
      );
    }

    const reference = `PO-${generateShortCode(10)}`;
    const destinationName =
      guide.payoutName ?? guide.companyName ?? guide.user.fullName ?? 'yoGuide provider';

    // Recorded before the provider is contacted, so a payout can never
    // happen without a row describing it.
    const payout = await this.prisma.payout.create({
      data: {
        guideId: guide.id,
        bookingId: params.bookingId,
        amount: new Prisma.Decimal(amountRwf),
        currency: 'RWF',
        status: PayoutStatus.PROCESSING,
        destinationMsisdn: guide.payoutMsisdn,
        destinationName,
        reference,
        requestedById: params.requestedById,
        note: params.note,
      },
    });

    const { outcome, providerStatus, call } = await this.provider.sendPayout({
      msisdn: guide.payoutMsisdn,
      name: destinationName,
      amount: amountRwf,
      reference,
      telecomProviderId: guide.payoutTelecomId,
    });

    if (!call.ok) {
      const failed = await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.FAILED,
          providerStatus,
          failureReason: call.error ?? 'Provider rejected the payout.',
        },
      });
      throw new ServiceUnavailableException(
        failed.failureReason ?? 'Could not send the payout.',
      );
    }

    const updated = await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        providerStatus,
        providerRef: (call.data?.reference as string | undefined) ?? reference,
        status:
          outcome === 'SUCCESSFUL' ? PayoutStatus.SUCCESSFUL : PayoutStatus.PROCESSING,
        processedAt: outcome === 'SUCCESSFUL' ? new Date() : null,
      },
    });

    if (outcome === 'SUCCESSFUL') await this.announce(updated.id);
    return this.toWire(updated);
  }

  // ── Direct provider payment (the QR / "pay this provider" flow) ──
  //
  // Two legs. First the traveller's money is collected and verified; only
  // then is anything owed to the provider. The flow this replaces fired a
  // payout with no collection behind it at all, to a phone number hardcoded
  // in the payment worker.

  /// Starts a traveller paying a provider directly.
  ///
  /// The payer names the provider by their public payment code; the payee's
  /// real number is resolved here and never travels over the wire.
  async collectForProvider(params: {
    code: string;
    amountRwf: number;
    payerUserId: string;
    note?: string;
  }) {
    const { amountRwf } = params;
    if (!Number.isInteger(amountRwf) || amountRwf <= 0) {
      throw new BadRequestException('amount must be a positive whole number of RWF.');
    }
    const minimum = Number(this.config.get<string>('MIN_DIRECT_PAYMENT_RWF') ?? '100');
    if (amountRwf < minimum) {
      throw new BadRequestException(`The minimum payment is ${minimum} RWF.`);
    }

    // Resolves and validates the provider — throws if unverified or with no
    // payout destination set.
    const resolved = await this.resolvePaymentCode(params.code);

    const guide = await this.prisma.guideProfile.findUnique({
      where: { id: resolved.guideId },
      select: {
        id: true,
        payoutMsisdn: true,
        payoutName: true,
        companyName: true,
        user: { select: { fullName: true } },
      },
    });
    if (!guide?.payoutMsisdn) {
      throw new ConflictException('This provider cannot receive payments yet.');
    }
    if (!this.provider.isConfigured) {
      throw new ServiceUnavailableException(
        'Payments are not configured on this server.',
      );
    }

    const payer = await this.prisma.user.findUnique({
      where: { id: params.payerUserId },
      select: { fullName: true, email: true, phone: true },
    });
    if (!payer?.phone) {
      throw new BadRequestException(
        'Add a phone number to your profile before paying — the payment provider requires one.',
      );
    }

    const reference = `PD-${generateShortCode(10)}`;
    const payout = await this.prisma.payout.create({
      data: {
        guideId: guide.id,
        amount: new Prisma.Decimal(amountRwf),
        currency: 'RWF',
        // PENDING: nothing is owed to the provider until the money is in.
        status: PayoutStatus.PENDING,
        destinationMsisdn: guide.payoutMsisdn,
        destinationName:
          guide.payoutName ?? guide.companyName ?? guide.user.fullName ?? 'yoGuide provider',
        reference,
        payerUserId: params.payerUserId,
        note: params.note,
      },
    });

    const { session, call } = await this.provider.createCheckout({
      customerName: payer.fullName ?? 'yoGuide traveller',
      customerPhone: payer.phone,
      customerEmail: payer.email,
      amount: amountRwf,
      customerRef: reference,
    });

    if (!call.ok || !session.sessionId) {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.FAILED,
          failureReason: call.error ?? 'Could not open a checkout for this payment.',
        },
      });
      throw new ServiceUnavailableException(
        call.error ?? 'Could not start the payment. Please try again.',
      );
    }

    const updated = await this.prisma.payout.update({
      where: { id: payout.id },
      data: { collectionRef: session.sessionId, collectionStatus: session.status },
    });

    return {
      ...this.toWire(updated),
      payee: resolved,
      redirectUrl: session.redirectUrl,
      collectionStatus: 'PENDING',
    };
  }

  /// Verifies the collection leg with the provider and applies the result.
  ///
  /// Scoped to the payer, so one traveller cannot poll or influence
  /// another's payment. Only a verified collection marks money as received.
  async verifyCollection(payoutId: string, payerUserId?: string) {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, ...(payerUserId ? { payerUserId } : {}) },
    });
    if (!payout) throw new NotFoundException(`Payment '${payoutId}' not found.`);
    if (!payout.collectionRef) {
      throw new ConflictException('This payout has no collection to verify.');
    }
    if (payout.collectedAt) {
      return { ...this.toWire(payout), collectionStatus: 'SUCCESSFUL' };
    }

    const { outcome, providerStatus, call } = await this.provider.getCheckoutStatus(
      payout.collectionRef,
    );
    if (!call.ok) {
      throw new ServiceUnavailableException(
        'Could not reach the payment provider to verify this payment.',
      );
    }

    if (outcome === 'SUCCESSFUL') {
      const updated = await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          collectionStatus: providerStatus,
          collectedAt: new Date(),
          // Money is in. What the provider is owed is now a real obligation,
          // settled by the payout leg (admin-triggered, same convention as
          // refunds — recorded here, released deliberately).
          status: PayoutStatus.PENDING,
        },
      });
      await this.announceCollected(updated.id);
      return { ...this.toWire(updated), collectionStatus: 'SUCCESSFUL' };
    }

    if (outcome === 'PENDING') {
      const updated = await this.prisma.payout.update({
        where: { id: payout.id },
        data: { collectionStatus: providerStatus },
      });
      return { ...this.toWire(updated), collectionStatus: 'PENDING' };
    }

    const updated = await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: PayoutStatus.CANCELLED,
        collectionStatus: providerStatus,
        failureReason: providerStatus ?? outcome,
      },
    });
    return { ...this.toWire(updated), collectionStatus: outcome };
  }

  private async announceCollected(payoutId: string) {
    try {
      const payout = await this.prisma.payout.findUnique({
        where: { id: payoutId },
        include: { guide: { select: { userId: true } } },
      });
      if (!payout) return;
      if (payout.guide?.userId) {
        await this.notifications.notify({
          userId: payout.guide.userId,
          type: NotificationType.PaymentSucceeded,
          title: 'A customer paid you',
          message: `${payout.currency} ${payout.amount.toString()} was received. Reference ${payout.reference}.`,
          transactionId: payout.id,
        });
      }
      if (payout.payerUserId) {
        await this.notifications.notify({
          userId: payout.payerUserId,
          type: NotificationType.PaymentSucceeded,
          title: 'Payment sent',
          message: `You paid ${payout.currency} ${payout.amount.toString()} to ${payout.destinationName ?? 'a yoGuide provider'}.`,
          transactionId: payout.id,
        });
      }
    } catch (error) {
      this.logger.error(`Collection announcement failed for ${payoutId}: ${String(error)}`);
    }
  }

  /// Re-reads a payout's status from the provider and applies it. Safe to
  /// poll; terminal states are never re-read.
  async verify(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException(`Payout '${payoutId}' not found.`);
    if (
      payout.status === PayoutStatus.SUCCESSFUL ||
      payout.status === PayoutStatus.FAILED ||
      payout.status === PayoutStatus.CANCELLED
    ) {
      return this.toWire(payout);
    }

    const { outcome, providerStatus, call } = await this.provider.getPayoutStatus(
      payout.reference,
    );
    if (!call.ok) {
      throw new ServiceUnavailableException(
        'Could not reach the payment provider to check this payout.',
      );
    }

    const status =
      outcome === 'SUCCESSFUL'
        ? PayoutStatus.SUCCESSFUL
        : outcome === 'FAILED'
          ? PayoutStatus.FAILED
          : outcome === 'CANCELLED'
            ? PayoutStatus.CANCELLED
            : PayoutStatus.PROCESSING;

    const updated = await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        status,
        providerStatus,
        processedAt: status === PayoutStatus.SUCCESSFUL ? new Date() : null,
        failureReason:
          status === PayoutStatus.FAILED ? (providerStatus ?? 'Payout failed.') : null,
      },
    });

    // Terminal states returned early above, so reaching here means the
    // payout was still in flight — a SUCCESSFUL result is therefore always
    // a transition, and always worth announcing exactly once.
    if (status === PayoutStatus.SUCCESSFUL) {
      await this.announce(updated.id);
    }
    return this.toWire(updated);
  }

  async listForGuide(guideId: string) {
    const rows = await this.prisma.payout.findMany({
      where: { guideId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toWire(r));
  }

  private async announce(payoutId: string) {
    try {
      const payout = await this.prisma.payout.findUnique({
        where: { id: payoutId },
        include: { guide: { select: { userId: true } } },
      });
      if (!payout?.guide?.userId) return;
      await this.notifications.notify({
        userId: payout.guide.userId,
        type: NotificationType.PaymentSucceeded,
        title: 'You have been paid',
        message: `${payout.currency} ${payout.amount.toString()} was sent to ${maskMsisdn(payout.destinationMsisdn)}.`,
        transactionId: payout.id,
      });
    } catch (error) {
      this.logger.error(`Payout announcement failed for ${payoutId}: ${String(error)}`);
    }
  }

  private toWire(p: {
    id: string;
    guideId: string;
    amount: Prisma.Decimal;
    currency: string;
    status: PayoutStatus;
    destinationMsisdn: string;
    destinationName: string | null;
    reference: string;
    providerStatus: string | null;
    failureReason: string | null;
    processedAt: Date | null;
    createdAt: Date;
    collectedAt?: Date | null;
    payerUserId?: string | null;
  }) {
    return {
      id: p.id,
      guideId: p.guideId,
      amount: p.amount.toString(),
      currency: p.currency,
      status: p.status,
      // Masked on the way out, always.
      destination: maskMsisdn(p.destinationMsisdn),
      destinationName: p.destinationName,
      reference: p.reference,
      providerStatus: p.providerStatus,
      failureReason: p.failureReason,
      processedAt: p.processedAt?.toISOString() ?? null,
      collectedAt: p.collectedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
