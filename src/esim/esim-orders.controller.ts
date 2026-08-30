import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class OrderEsimDto {
  @IsString()
  @MinLength(1)
  bundleId!: string;

  @IsEmail()
  deliveryEmail!: string;
}

/// POST /orders/esim — recorded as a mock order, same honesty convention as
/// WalletService.topUp()'s "mock top-up" labeling. No real eSIM provider is
/// wired up server-side; bundleId is whatever catalog id the client sent,
/// not validated against a real bundle list.
@ApiTags('eSIM')
@ApiBearerAuth('access-token')
@Controller('orders/esim')
@UseGuards(AuthGuard)
export class EsimOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({ summary: 'Order an eSIM bundle (mock)' })
  async order(@CurrentUser() user: AuthenticatedUser, @Body() dto: OrderEsimDto) {
    await this.prisma.esimOrder.create({
      data: {
        userId: user.id,
        bundleId: dto.bundleId,
        deliveryEmail: dto.deliveryEmail,
      },
    });
    return {
      status: 'mock_confirmed',
      message: `Your eSIM bundle will be delivered to ${dto.deliveryEmail} shortly (mock order — no real eSIM provider is connected yet).`,
    };
  }
}
