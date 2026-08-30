import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class ChangeCardPasswordDto {
  @IsString()
  @MinLength(1)
  cardId!: string;

  @IsString()
  @MinLength(1)
  oldPassword!: string;

  @IsString()
  @MinLength(4)
  newPassword!: string;
}

function maskedNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

/// Cards are issued by an admin (POST /admin/cards) — never self-issued.
/// No full card number is ever stored or returned; `cardNumber` below is
/// always a masked display string built from `last4`, not a real PAN.
@ApiTags('Cards')
@ApiBearerAuth('access-token')
@Controller('cards')
@UseGuards(AuthGuard)
export class CardsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('my')
  @ApiOperation({ summary: 'My corporate cards' })
  async myCards(@CurrentUser() user: AuthenticatedUser) {
    const cards = await this.prisma.card.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return cards.map((c) => ({
      id: c.id,
      type: c.type,
      last4: c.last4,
      cardNumber: maskedNumber(c.last4),
      limit: c.limitCents / 100,
      amount: (c.limitCents / 100).toFixed(2),
      spent: c.spentCents / 100,
      status: c.status,
    }));
  }

  @Post('change-password')
  @ApiOperation({ summary: "Change one of my cards' PIN" })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangeCardPasswordDto) {
    const card = await this.prisma.card.findUnique({ where: { id: dto.cardId } });
    if (!card || card.userId !== user.id) {
      throw new NotFoundException('Card not found.');
    }
    const ok = await bcrypt.compare(dto.oldPassword, card.pinHash);
    if (!ok) {
      throw new ForbiddenException('Current password is incorrect.');
    }
    const pinHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.card.update({ where: { id: card.id }, data: { pinHash } });
    return { success: true };
  }
}
