import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateForUser(userId: string) {
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.toDto(wallet, this.filterBookingTx(transactions));
  }

  async topUp(userId: string, amountCents: number, method: string) {
    if (amountCents <= 0) {
      throw new BadRequestException('Top-up amount must be positive.');
    }
    if (!['card', 'momo', 'cash'].includes(method)) {
      throw new BadRequestException(
        "Top-up method must be one of 'card', 'momo', or 'cash'.",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          kind: 'topup',
          amountCents,
          currency: wallet.currency,
          notes: `mock ${method} top-up`,
        },
      });
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceCents: { increment: amountCents } },
      });
      const transactions = await tx.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return this.toDto(updated, this.filterBookingTx(transactions));
    });
  }

  /**
   * Onboarding top-up rows have kind/amountCents null (they use
   * sourceAmount/rwfAmount instead). Filter them out before passing
   * to toDto which expects the booking-flow shape.
   */
  private filterBookingTx(
    rows: Array<{
      id: string;
      kind: string | null;
      amountCents: number | null;
      currency: string;
      bookingId: string | null;
      externalRef: string | null;
      notes: string | null;
      createdAt: Date;
    }>,
  ): Array<{
    id: string;
    kind: string;
    amountCents: number;
    currency: string;
    bookingId: string | null;
    externalRef: string | null;
    notes: string | null;
    createdAt: Date;
  }> {
    return rows.filter(
      (t): t is typeof t & { kind: string; amountCents: number } =>
        t.kind !== null && t.amountCents !== null,
    );
  }

  toDto(
    w: {
      id: string;
      userId: string;
      balanceCents: number;
      currency: string;
      createdAt: Date;
      updatedAt: Date;
    },
    transactions: Array<{
      id: string;
      kind: string;
      amountCents: number;
      currency: string;
      bookingId: string | null;
      externalRef: string | null;
      notes: string | null;
      createdAt: Date;
    }>,
  ) {
    return {
      id: w.id,
      userId: w.userId,
      balanceCents: w.balanceCents,
      currency: w.currency,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      transactions: transactions.map((t) => ({
        id: t.id,
        kind: t.kind,
        amountCents: t.amountCents,
        currency: t.currency,
        bookingId: t.bookingId,
        externalRef: t.externalRef,
        notes: t.notes,
        createdAt: t.createdAt,
      })),
    };
  }
}