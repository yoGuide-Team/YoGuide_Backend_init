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
import { AdminRoleGuard } from './guards/admin-role.guard';

class WalletAdjustmentDto {
  @IsInt()
  amountCents!: number;

  @IsIn(['adjustment', 'topup', 'refund', 'debit'])
  kind!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Admin · Wallets')
@ApiBearerAuth('access-token')
@Controller('admin/wallets')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminWalletsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List wallets' })
  async list() {
    return this.prisma.wallet.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
      take: 200,
    });
  }

  @Get(':userId')
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

    return { ...wallet, transactions };
  }

  @Post(':userId/adjust')
  @ApiOperation({ summary: 'Manual wallet adjustment' })
  async adjust(@Param('userId') userId: string, @Body() dto: WalletAdjustmentDto) {
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
        throw new BadRequestException('Adjustment would push wallet below zero.');
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

    return this.findOne(userId);
  }
}
