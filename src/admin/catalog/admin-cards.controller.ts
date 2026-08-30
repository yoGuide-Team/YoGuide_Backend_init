import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CardStatus, CardTransactionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { generateShortCode } from '../../common/short-code';
import { parseAdminSort } from '../../common/admin-sort';

class IssueCardDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsInt()
  @Min(0)
  limitCents!: number;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

class UpdateCardDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  limitCents?: number;

  @IsOptional()
  @IsEnum(CardStatus)
  status?: CardStatus;

  @IsOptional()
  @IsString()
  organization?: string;
}

function last4Of(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/// Full CRUD over corporate cards. Issuing a card (POST) is the only way a
/// Card is ever created — no self-issue endpoint exists. The plaintext PIN
/// is returned exactly once, at issuance, for the admin to hand to the
/// cardholder; it is never stored or retrievable again (only pinHash is
/// kept) — the cardholder changes it via POST /cards/change-password.
@ApiTags('Admin · Cards')
@ApiBearerAuth('access-token')
@Controller('admin/cards')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminCardsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all corporate cards' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'createdAt | limitCents | spentCents' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  list(@Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.prisma.card.findMany({
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: parseAdminSort(
        sortBy,
        sortDir,
        ['createdAt', 'limitCents', 'spentCents'] as const,
        { createdAt: 'desc' },
      ),
    });
  }

  @Get('transactions')
  @ApiOperation({ summary: 'All card transactions, platform-wide' })
  transactions() {
    return this.prisma.cardTransaction.findMany({
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        hotel: { select: { id: true, name: true } },
        card: { select: { id: true, last4: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Patch('transactions/:id')
  @ApiOperation({ summary: 'Update a transaction\'s status (e.g. resolve a dispute)' })
  async updateTransaction(@Param('id') id: string, @Body('status') status: CardTransactionStatus) {
    const existing = await this.prisma.cardTransaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Transaction '${id}' not found.`);
    return this.prisma.cardTransaction.update({ where: { id }, data: { status } });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a card by id' })
  async get(@Param('id') id: string) {
    const card = await this.prisma.card.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!card) throw new NotFoundException(`Card '${id}' not found.`);
    return card;
  }

  @Post()
  @ApiOperation({
    summary: 'Issue a new card to a user',
    description: 'Returns the card plus a one-time plaintext initialPin — only shown here, never again.',
  })
  async issue(@Body() dto: IssueCardDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`User '${dto.userId}' not found.`);

    const initialPin = generatePin();
    const pinHash = await bcrypt.hash(initialPin, 10);
    const card = await this.prisma.card.create({
      data: {
        userId: dto.userId,
        type: dto.type ?? 'virtual',
        last4: last4Of(),
        pinHash,
        limitCents: dto.limitCents,
        organization: dto.organization,
      },
    });
    return { ...card, initialPin };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a card\'s limit, status, or organization' })
  async update(@Param('id') id: string, @Body() dto: UpdateCardDto) {
    await this.ensureExists(id);
    return this.prisma.card.update({ where: { id }, data: dto });
  }

  @Post(':id/reset-pin')
  @ApiOperation({ summary: "Reset a card's PIN (e.g. cardholder locked out)" })
  async resetPin(@Param('id') id: string) {
    await this.ensureExists(id);
    const initialPin = generatePin();
    const pinHash = await bcrypt.hash(initialPin, 10);
    await this.prisma.card.update({ where: { id }, data: { pinHash } });
    return { ok: true, initialPin };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remove a card',
    description: 'Hard-deletes if it has no transaction history; otherwise marks it CANCELLED instead, to keep past transactions intact.',
  })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const transactionCount = await this.prisma.cardTransaction.count({ where: { cardId: id } });
    if (transactionCount > 0) {
      await this.prisma.card.update({ where: { id }, data: { status: CardStatus.CANCELLED } });
      return { ok: true, cancelled: true };
    }
    await this.prisma.card.delete({ where: { id } });
    return { ok: true, deleted: true };
  }

  private async ensureExists(id: string) {
    const card = await this.prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundException(`Card '${id}' not found.`);
    return card;
  }
}
