import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBookingDto } from './dto';

const VALID_STATUSES = new Set([
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'refunded',
]);

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateBookingDto) {
    if (dto.placeId) {
      const exists = await this.prisma.place.findUnique({
        where: { id: dto.placeId },
        select: { id: true },
      });
      if (!exists) {
        throw new BadRequestException(`Place '${dto.placeId}' does not exist.`);
      }
    }

    // Wallet path: validate balance + debit + create transactions atomically.
    if (dto.paymentMethod === 'wallet') {
      return this.prisma.$transaction(async (tx) => {
        const wallet = await this.ensureWallet(tx, userId);
        if (wallet.balanceCents < dto.totalCents) {
          throw new BadRequestException(
            `Insufficient wallet balance. Have ${wallet.balanceCents}¢, need ${dto.totalCents}¢.`,
          );
        }
        const booking = await tx.booking.create({
          data: this.buildCreateData(userId, dto, 'confirmed'),
        });
        await tx.bookingTransaction.create({
          data: {
            bookingId: booking.id,
            kind: 'charge',
            method: 'wallet',
            amountCents: dto.totalCents,
            currency: booking.currency,
            status: 'settled',
          },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            kind: 'debit',
            amountCents: dto.totalCents,
            currency: booking.currency,
            bookingId: booking.id,
          },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balanceCents: { decrement: dto.totalCents } },
        });
        return this.findOneInTx(tx, booking.id);
      });
    }

    // Off-wallet path: booking starts pending; the corresponding charge is
    // pending too. The operator (or a future webhook) settles it later.
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: this.buildCreateData(userId, dto, 'pending'),
      });
      await tx.bookingTransaction.create({
        data: {
          bookingId: booking.id,
          kind: 'charge',
          method: dto.paymentMethod,
          amountCents: dto.totalCents,
          currency: booking.currency,
          status: 'pending',
        },
      });
      return this.findOneInTx(tx, booking.id);
    });
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: this.detailInclude(),
    });
    return rows.map((r) => this.toDto(r));
  }

  async findOne(userId: string, id: string) {
    const row = await this.prisma.booking.findUnique({
      where: { id },
      include: this.detailInclude(),
    });
    if (!row) throw new NotFoundException('Booking not found.');
    if (row.userId !== userId) {
      throw new ForbiddenException('That booking belongs to someone else.');
    }
    return this.toDto(row);
  }

  async cancel(userId: string, id: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: { transactions: true },
      });
      if (!booking) throw new NotFoundException('Booking not found.');
      if (booking.userId !== userId) {
        throw new ForbiddenException('That booking belongs to someone else.');
      }
      if (booking.status === 'cancelled' || booking.status === 'refunded') {
        throw new BadRequestException('Booking is already cancelled.');
      }
      if (booking.status === 'completed') {
        throw new BadRequestException(
          'Completed bookings cannot be cancelled — request a refund instead.',
        );
      }

      const settledCharge = booking.transactions.find(
        (t) => t.kind === 'charge' && t.status === 'settled',
      );
      const newStatus = settledCharge ? 'refunded' : 'cancelled';

      await tx.booking.update({
        where: { id },
        data: {
          status: newStatus,
          notes: reason ? `cancelled: ${reason}` : booking.notes,
        },
      });

      if (settledCharge && settledCharge.method === 'wallet') {
        // Refund back to wallet.
        const wallet = await this.ensureWallet(tx, userId);
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            kind: 'refund',
            amountCents: settledCharge.amountCents,
            currency: booking.currency,
            bookingId: booking.id,
          },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balanceCents: { increment: settledCharge.amountCents } },
        });
        await tx.bookingTransaction.create({
          data: {
            bookingId: booking.id,
            kind: 'refund',
            method: 'wallet',
            amountCents: settledCharge.amountCents,
            currency: booking.currency,
            status: 'settled',
          },
        });
      } else if (settledCharge) {
        // Off-wallet refund — record pending; an operator (or webhook)
        // settles via the admin force-refund endpoint.
        await tx.bookingTransaction.create({
          data: {
            bookingId: booking.id,
            kind: 'refund',
            method: settledCharge.method,
            amountCents: settledCharge.amountCents,
            currency: booking.currency,
            status: 'pending',
          },
        });
      }

      return this.findOneInTx(tx, booking.id);
    });
  }

  // ─── helpers ────────────────────────────────────────────

  private buildCreateData(
    userId: string,
    dto: CreateBookingDto,
    status: string,
  ): Prisma.BookingUncheckedCreateInput {
    return {
      userId,
      type: dto.type,
      status,
      totalCents: dto.totalCents,
      currency: dto.currency ?? 'USD',
      placeId: dto.placeId,
      details: (dto.details ?? {}) as Prisma.InputJsonValue,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      notes: dto.notes,
    };
  }

  private async ensureWallet(tx: Prisma.TransactionClient, userId: string) {
    const existing = await tx.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return tx.wallet.create({ data: { userId } });
  }

  private detailInclude() {
    return {
      transactions: { orderBy: { createdAt: 'asc' as const } },
      place: { select: { id: true, name: true, kind: true } },
      user: { select: { id: true, email: true, fullName: true } },
    };
  }

  private async findOneInTx(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.booking.findUnique({
      where: { id },
      include: this.detailInclude(),
    });
    if (!row) throw new NotFoundException('Booking not found.');
    return this.toDto(row);
  }

  toDto(b: any) {
    return {
      id: b.id,
      userId: b.userId,
      type: b.type,
      status: b.status,
      totalCents: b.totalCents,
      currency: b.currency,
      placeId: b.placeId,
      place: b.place
        ? { id: b.place.id, name: b.place.name, kind: b.place.kind }
        : null,
      user: b.user
        ? { id: b.user.id, email: b.user.email, fullName: b.user.fullName }
        : null,
      details: b.details,
      scheduledAt: b.scheduledAt,
      notes: b.notes,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      transactions: (b.transactions ?? []).map((t: any) => ({
        id: t.id,
        kind: t.kind,
        method: t.method,
        amountCents: t.amountCents,
        currency: t.currency,
        status: t.status,
        externalRef: t.externalRef,
        notes: t.notes,
        createdAt: t.createdAt,
      })),
    };
  }

  /// Used by admin endpoints. Validates the new status string.
  validateStatus(status: string) {
    if (!VALID_STATUSES.has(status)) {
      throw new BadRequestException(
        `status must be one of: ${[...VALID_STATUSES].join(', ')}.`,
      );
    }
  }
}
