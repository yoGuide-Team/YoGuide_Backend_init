import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';
import { CardStatus, CardTransactionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { generateShortCode } from '../common/short-code';

class InitiatePaymentDto {
  @IsString()
  @MinLength(1)
  hotelCode!: string;
}

class ConfirmPaymentDto {
  @IsString()
  @MinLength(1)
  hotelCode!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  cardId!: string;

  @IsString()
  @MinLength(1)
  cardPassword!: string;
}

const TRANSACTION_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  hotel: { select: { id: true, managerId: true, name: true, city: true, address: true, phone: true, code: true } },
  card: { select: { id: true, last4: true, type: true, organization: true } },
} satisfies Prisma.CardTransactionInclude;

type TransactionWithRelations = Prisma.CardTransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;

function toWire(t: TransactionWithRelations) {
  const [firstName, ...rest] = (t.user.fullName ?? '').split(' ');
  return {
    id: t.id,
    amount: t.amountCents / 100,
    title: t.title,
    details: t.details,
    status: t.status,
    description: t.details,
    reference: t.reference,
    paymentMethod: 'Corporate card',
    createdAt: t.createdAt.toISOString(),
    userId: t.userId,
    serviceProviderId: t.hotelId,
    cardId: t.cardId,
    user: { id: t.user.id, firstName: firstName ?? '', lastName: rest.join(' '), email: t.user.email },
    serviceProvider: t.hotel
      ? {
          id: t.hotel.id,
          name: t.hotel.name,
          category: 'hotel',
          description: '',
          rating: 0,
          latitude: 0,
          longitude: 0,
          address: t.hotel.address ?? '',
          phone: t.hotel.phone ?? '',
          email: '',
        }
      : null,
    clientOrg: t.card.organization,
    card: { id: t.card.id, last4: t.card.last4, type: t.card.type },
    employeeName: t.user.fullName,
    hotelName: t.hotel?.name ?? null,
  };
}

/// Corporate-card payment flow. "Service provider" in the Flutter client's
/// vocabulary maps onto the existing Hotel model — see Card/CardTransaction
/// in schema.prisma for why no separate ServiceProvider entity exists.
@ApiTags('Payments')
@ApiBearerAuth('access-token')
@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'My card transactions (as the paying employee)' })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.prisma.cardTransaction.findMany({
      where: { userId: user.id },
      include: TRANSACTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWire);
  }

  @Get('provider')
  @ApiOperation({ summary: 'Card transactions received by the hotel I manage' })
  @ApiQuery({ name: 'status', required: false, enum: CardTransactionStatus })
  async provider(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: CardTransactionStatus,
  ) {
    const hotel = await this.prisma.hotel.findUnique({ where: { managerId: user.id } });
    if (!hotel) return [];
    const rows = await this.prisma.cardTransaction.findMany({
      where: { hotelId: hotel.id, status: status || undefined },
      include: TRANSACTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWire);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one transaction (payer, receiving hotel manager, or admin only)' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const t = await this.prisma.cardTransaction.findUnique({
      where: { id },
      include: TRANSACTION_INCLUDE,
    });
    if (!t) throw new NotFoundException(`Transaction '${id}' not found.`);

    const isPayer = t.userId === user.id;
    const isAdmin = user.roleKey === 'ADMIN' || user.roleKey === 'admin';
    const isReceivingManager = t.hotel?.managerId === user.id;
    if (!isPayer && !isAdmin && !isReceivingManager) {
      throw new ForbiddenException('Not your transaction.');
    }
    return toWire(t);
  }

  @Post('initiate')
  @ApiOperation({ summary: "Look up a hotel by its short payment code before charging" })
  async initiate(@Body() dto: InitiatePaymentDto) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { code: dto.hotelCode.trim().toUpperCase() },
    });
    if (!hotel || !hotel.isVerified) {
      throw new NotFoundException('No verified hotel found for that code.');
    }
    return { valid: true, hotel: { id: hotel.id, name: hotel.name, city: hotel.city, code: hotel.code } };
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Charge a card for a hotel payment',
    description: 'Verifies the card PIN and available limit, then settles the charge.',
  })
  async confirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmPaymentDto) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { code: dto.hotelCode.trim().toUpperCase() },
    });
    if (!hotel || !hotel.isVerified) {
      throw new NotFoundException('No verified hotel found for that code.');
    }

    const card = await this.prisma.card.findUnique({ where: { id: dto.cardId } });
    if (!card || card.userId !== user.id) {
      throw new NotFoundException('Card not found.');
    }
    if (card.status !== CardStatus.ACTIVE) {
      throw new BadRequestException(`Card is ${card.status.toLowerCase()}, not active.`);
    }
    const pinOk = await bcrypt.compare(dto.cardPassword, card.pinHash);
    if (!pinOk) {
      throw new ForbiddenException('Incorrect card password.');
    }

    const amountCents = Math.round(dto.amount * 100);
    if (card.spentCents + amountCents > card.limitCents) {
      throw new BadRequestException('This charge would exceed the card limit.');
    }

    const [, transaction] = await this.prisma.$transaction([
      this.prisma.card.update({
        where: { id: card.id },
        data: { spentCents: { increment: amountCents } },
      }),
      this.prisma.cardTransaction.create({
        data: {
          cardId: card.id,
          userId: user.id,
          hotelId: hotel.id,
          amountCents,
          currency: card.currency,
          status: CardTransactionStatus.SETTLED,
          title: `Payment to ${hotel.name}`,
          reference: `REF-${generateShortCode(8)}`,
        },
        include: TRANSACTION_INCLUDE,
      }),
    ]);

    return { transaction: toWire(transaction) };
  }
}
