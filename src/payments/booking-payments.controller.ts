import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RefundStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AdminRoleGuard } from '../admin/guards/admin-role.guard';
import { BookingPaymentsService } from './booking-payments.service';
import { RefundService } from './refund.service';
import { YoEcoPayClient } from './yoecopay.client';

class WebhookDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  customerRef?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class MarkRefundProcessedDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerRef?: string;
}

class AdminCancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/// Payment-provider callback and admin refund operations.
@ApiTags('Payments · Bookings')
@Controller()
export class BookingPaymentsController {
  private readonly logger = new Logger(BookingPaymentsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: BookingPaymentsService,
    private readonly refunds: RefundService,
    private readonly provider: YoEcoPayClient,
    private readonly config: ConfigService,
  ) {}

  /// Provider-initiated notification that a payment changed state.
  ///
  /// The body is treated as a *hint only*: it tells us which session to
  /// look at, and nothing more. The status written to the database always
  /// comes from our own server-to-server read of the provider, so a forged
  /// webhook cannot confirm a booking even if it passes signature checks.
  @Post('payments/webhook')
  @ApiExcludeEndpoint()
  async webhook(
    @Body() body: WebhookDto,
    @Headers('x-signature') signature?: string,
  ) {
    this.assertSignature(signature, body);

    const sessionId = body.sessionId ?? body.customerRef;
    if (!sessionId) {
      throw new BadRequestException('Webhook payload carried no session reference.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { OR: [{ providerRef: sessionId }, { transactionRef: sessionId }] },
      select: { bookingId: true, providerRef: true },
    });
    if (!payment) {
      // Unknown reference — acknowledge so the provider stops retrying, but
      // change nothing.
      this.logger.warn(`Webhook for unknown payment reference '${sessionId}'.`);
      return { ok: true, matched: false };
    }

    // Re-read the authoritative status ourselves rather than trusting the body.
    await this.payments.verify(payment.bookingId);
    return { ok: true, matched: true };
  }

  /// Verifies the webhook HMAC when a secret is configured.
  ///
  /// If YOECOPAY_WEBHOOK_SECRET is not set the endpoint refuses every
  /// request rather than accepting unsigned ones — an unauthenticated
  /// state-changing endpoint is worse than a disabled one.
  private assertSignature(signature: string | undefined, body: unknown) {
    const secret = this.config.get<string>('YOECOPAY_WEBHOOK_SECRET');
    if (!secret) {
      throw new UnauthorizedException(
        'Webhooks are not enabled on this server (YOECOPAY_WEBHOOK_SECRET is unset).',
      );
    }
    if (!signature) throw new UnauthorizedException('Missing X-Signature header.');

    const expected = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    const provided = signature.trim().toLowerCase().replace(/^sha256=/, '');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
  }

  // ── Admin refunds ──────────────────────────────────────────

  @Get('admin/refunds')
  @ApiTags('Admin · Refunds')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'List refunds' })
  @ApiQuery({ name: 'status', required: false, enum: RefundStatus })
  listRefunds(@Query('status') status?: RefundStatus) {
    return this.prisma.refund.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            scheduleDate: true,
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
        payment: { select: { id: true, provider: true, providerRef: true, amount: true } },
      },
    });
  }

  @Post('admin/refunds/:id/processed')
  @ApiTags('Admin · Refunds')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard, AdminRoleGuard)
  @ApiOperation({
    summary: 'Mark a refund as actually paid out',
    description:
      'Recorded only after reconciling with the payment provider. Refunds are never ' +
      'auto-marked complete, because the money moving is a fact about the provider, not about us.',
  })
  markProcessed(@Param('id') id: string, @Body() dto: MarkRefundProcessedDto) {
    return this.refunds.markProcessed(id, dto?.providerRef);
  }

  @Post('admin/bookings/:id/cancel')
  @ApiTags('Admin · Refunds')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard, AdminRoleGuard)
  @ApiOperation({
    summary: 'Cancel any booking with a full refund',
    description:
      'For provider-side cancellations and support cases: refunds in full regardless of ' +
      'how close the date is, so the customer is not penalised for something they did not do.',
  })
  async adminCancel(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdminCancelDto,
  ) {
    const exists = await this.prisma.booking.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Booking '${id}' not found.`);
    const result = await this.refunds.cancelBooking({
      bookingId: id,
      requestedById: admin.id,
      reason: dto?.reason ?? 'Cancelled by yoGuide support',
      forceFullRefund: true,
    });
    return { booking: result.booking, refund: result.refund };
  }

  // ── Diagnostics ────────────────────────────────────────────

  @Get('payments/config')
  @ApiTags('Payments · Bookings')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard, AdminRoleGuard)
  @ApiOperation({
    summary: 'Whether the online payment rail is configured (admin only)',
    description: 'Reports configuration presence. Never returns secret values.',
  })
  paymentConfig() {
    return {
      provider: 'xentripay (via yoEcoPay worker)',
      configured: this.provider.isConfigured,
      webhookEnabled: Boolean(this.config.get<string>('YOECOPAY_WEBHOOK_SECRET')),
      fxRateConfigured: Boolean(this.config.get<string>('USD_TO_RWF_RATE')),
    };
  }
}
