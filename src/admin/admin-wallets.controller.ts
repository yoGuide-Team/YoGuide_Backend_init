import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

class WalletAdjustmentDto {
  @IsInt()
  amountCents!: number; // positive for credit, negative for debit

  @IsIn(['adjustment', 'topup', 'refund', 'debit'])
  kind!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Admin · Wallets')
@ApiBearerAuth('access-token')
@Controller('admin/wallets')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminWalletsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('wallets.read')
  @ApiOperation({ summary: 'List wallets', description: 'Per-user balances, ordered by most recent activity.' })
  async list() {
    const rows = await this.prisma.wallet.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
      take: 200,
    });
    return rows.map((w) => ({
      id: w.id,
      userId: w.userId,
      user: w.user,
      balanceCents: w.balanceCents,
      currency: w.currency,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
  }

  @Get(':userId')
  @RequirePermissions('wallets.read')
  @ApiOperation({ summary: 'Wallet detail + history' })
  async findOne(@Param('userId') userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found.');
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      id: wallet.id,
      userId: wallet.userId,
      user: wallet.user,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
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

  /// Manual ledger adjustment. Use sparingly — a real audit trail will
  /// belong on top of this once we ship.
  @Post(':userId/adjust')
  @RequirePermissions('wallets.write')
  @ApiOperation({ summary: 'Manual adjustment', description: 'Credit (positive cents) or debit (negative cents) a wallet. Reason text is recorded in the ledger. Will not push the balance below zero.' })
  async adjust(
    @Param('userId') userId: string,
    @Body() dto: WalletAdjustmentDto,
  ) {
    if (dto.amountCents === 0) {
      throw new BadRequestException('amountCents must be non-zero.');
    }
    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
      if (wallet.balanceCents + dto.amountCents < 0) {
        throw new BadRequestException(
          'Adjustment would push wallet below zero.',
        );
      }
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          kind: dto.kind,
          amountCents: Math.abs(dto.amountCents),
          currency: wallet.currency,
          notes: dto.notes ?? 'admin adjustment',
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceCents: { increment: dto.amountCents } },
      });
    });
    // Read post-commit so the response reflects the new balance.
    return this.findOne(userId);
  }
}
