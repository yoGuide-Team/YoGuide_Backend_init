import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { BookingsService } from '../bookings/bookings.service';

class UpdateBookingStatusDto {
  @IsString() status!: string;
  @IsOptional() @IsString() notes?: string;
}

class SettleTransactionDto {
  @IsIn(['settled', 'failed'])
  status!: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}

class ForceRefundDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsIn(['wallet', 'card', 'momo', 'cash'])
  method!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Admin · Bookings')
@ApiBearerAuth('access-token')
@Controller('admin/bookings')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminBookingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  @Get()
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'List bookings', description: 'All bookings, with optional filters. Newest first, capped at 200 rows.' })
  async list(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
  ) {
    const rows = await this.prisma.booking.findMany({
      where: {
        status: status || undefined,
        userId: userId || undefined,
        type: type || undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        transactions: { orderBy: { createdAt: 'asc' } },
        place: { select: { id: true, name: true, kind: true } },
        user: { select: { id: true, email: true, fullName: true } },
      },
      take: 200,
    });
    return rows.map((r) => this.bookings.toDto(r));
  }

  @Get(':id')
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'Get one booking', description: 'Booking record with the full transaction trail (charges + refunds, in order).' })
  async findOne(@Param('id') id: string) {
    const row = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: { createdAt: 'asc' } },
        place: { select: { id: true, name: true, kind: true } },
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Booking not found.');
    return this.bookings.toDto(row);
  }

  @Patch(':id/status')
  @RequirePermissions('bookings.write')
  @ApiOperation({ summary: 'Change booking status', description: 'Manually advance a booking through its lifecycle (pending → confirmed → completed, or → cancelled / refunded).' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    this.bookings.validateStatus(dto.status);
    const exists = await this.prisma.booking.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Booking not found.');
    await this.prisma.booking.update({
      where: { id },
      data: { status: dto.status, notes: dto.notes ?? undefined },
    });
    return this.findOne(id);
  }

  @Patch(':bookingId/transactions/:txId')
  @RequirePermissions('bookings.write')
  @ApiOperation({ summary: 'Settle pending charge', description: 'Mark a pending off-wallet transaction as settled (e.g. cash received) or failed.' })
  async settleTransaction(
    @Param('bookingId') bookingId: string,
    @Param('txId') txId: string,
    @Body() dto: SettleTransactionDto,
  ) {
    const tx = await this.prisma.bookingTransaction.findUnique({
      where: { id: txId },
    });
    if (!tx || tx.bookingId !== bookingId) {
      throw new NotFoundException('Transaction not found on that booking.');
    }
    if (tx.status === 'settled') {
      throw new BadRequestException('Transaction is already settled.');
    }
    await this.prisma.bookingTransaction.update({
      where: { id: txId },
      data: { status: dto.status, externalRef: dto.externalRef ?? undefined },
    });
    return this.findOne(bookingId);
  }

  @Post(':id/force-refund')
  @RequirePermissions('bookings.write')
  @ApiOperation({ summary: 'Force refund', description: 'Operator-driven refund. If `method=wallet`, the wallet is credited atomically. Otherwise a settled refund transaction is recorded for the operator-side payment trail.' })
  async forceRefund(@Param('id') id: string, @Body() dto: ForceRefundDto) {
    return this.prisma.$transaction(async (txDb) => {
      const booking = await txDb.booking.findUnique({ where: { id } });
      if (!booking) throw new NotFoundException('Booking not found.');

      if (dto.method === 'wallet') {
        const wallet = await txDb.wallet.upsert({
          where: { userId: booking.userId },
          update: {},
          create: { userId: booking.userId },
        });
        await txDb.walletTransaction.create({
          data: {
            walletId: wallet.id,
            kind: 'refund',
            amountCents: dto.amountCents,
            currency: booking.currency,
            bookingId: booking.id,
            notes: dto.notes ?? 'admin force-refund',
          },
        });
        await txDb.wallet.update({
          where: { id: wallet.id },
          data: { balanceCents: { increment: dto.amountCents } },
        });
        await txDb.bookingTransaction.create({
          data: {
            bookingId: booking.id,
            kind: 'refund',
            method: 'wallet',
            amountCents: dto.amountCents,
            currency: booking.currency,
            status: 'settled',
            notes: dto.notes ?? 'admin force-refund',
          },
        });
      } else {
        await txDb.bookingTransaction.create({
          data: {
            bookingId: booking.id,
            kind: 'refund',
            method: dto.method,
            amountCents: dto.amountCents,
            currency: booking.currency,
            status: 'settled',
            notes: dto.notes ?? 'admin force-refund',
          },
        });
      }

      await txDb.booking.update({
        where: { id },
        data: { status: 'refunded' },
      });

      const refreshed = await txDb.booking.findUnique({
        where: { id },
        include: {
          transactions: { orderBy: { createdAt: 'asc' } },
          place: { select: { id: true, name: true, kind: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      });
      return this.bookings.toDto(refreshed);
    });
  }
}
