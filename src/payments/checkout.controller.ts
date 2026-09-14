import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ProviderCallResult, YoEcoPayClient } from './yoecopay.client';

class ValidateRecipientDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  msisdn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  telecomProviderId!: string;
}

class InitiateCollectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerPhone!: string;

  /// RWF, whole units. Bounded so a typo or a tampered client cannot
  /// push an absurd amount at the gateway.
  @IsInt()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  customerRef!: string;

  @IsIn(['momo', 'cc'])
  pmethod!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipientName!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  recipientMsisdn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientTelecomProviderId?: string;
}

/// Server-side yoEcoPay checkout.
///
/// WHY THIS EXISTS: the apps used to POST straight to the yoEcoPay worker
/// with a hardcoded `X-App-Secret`. A Flutter *web* build compiles that
/// constant into `main.dart.js`, which is a public file — anyone who
/// fetched it could drive the payment worker as if they were the app. A
/// browser build cannot keep a secret, so the secret moved here: the app
/// authenticates to this backend with the user's own JWT, and only this
/// process knows `YOECOPAY_APP_SECRET`.
///
/// Every route below requires a signed-in user and is rate limited. The
/// provider's payload is passed back verbatim so the existing app UI keeps
/// parsing what it already parses.
@ApiTags('Payments')
@ApiBearerAuth('access-token')
@Controller('payments/checkout')
@UseGuards(AuthGuard)
export class CheckoutController {
  constructor(private readonly yoecopay: YoEcoPayClient) {}

  /// Turns a failed provider call into an error the client can show,
  /// without leaking the worker's URL or our credentials.
  private unwrap(call: ProviderCallResult): any {
    if (!call.ok) {
      throw new BadGatewayException(
        call.error ?? `Payment provider returned HTTP ${call.httpStatus}.`,
      );
    }
    return call.data ?? {};
  }

  @Post('validate-recipient')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: "Validate a recipient's mobile-money account",
    description:
      'Call before initiate() so the payer is not charged for a payment that ' +
      'cannot be forwarded.',
  })
  async validateRecipient(@Body() dto: ValidateRecipientDto) {
    return this.unwrap(
      await this.yoecopay.validatePayoutAccount({
        msisdn: dto.msisdn,
        telecomProviderId: dto.telecomProviderId,
      }),
    );
  }

  @Post('initiate')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Start a payment (momo push or card page)',
    description:
      "The payer's identity is taken from the access token, not from the " +
      'request body — a caller cannot bill under someone else\'s name.',
  })
  async initiate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InitiateCollectionDto,
  ) {
    return this.unwrap(
      await this.yoecopay.createCollection({
        // Identity comes from the JWT. The client no longer gets to say
        // who is paying.
        customerName: user.fullName ?? user.email,
        customerEmail: user.email,
        customerPhone: dto.customerPhone,
        amount: dto.amount,
        customerRef: dto.customerRef,
        pmethod: dto.pmethod,
        recipientName: dto.recipientName,
        recipientMsisdn: dto.recipientMsisdn,
        recipientTelecomProviderId: dto.recipientTelecomProviderId ?? null,
      }),
    );
  }

  @Post('finalize/:customerRef')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Authoritative status of a collection',
    description: 'Polled by the app while a momo push is outstanding.',
  })
  async finalize(@Param('customerRef') customerRef: string) {
    return this.unwrap(await this.yoecopay.finalizeCollection(customerRef));
  }

  @Get('payout-status/:reference')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Authoritative status of an outbound payout' })
  async payoutStatus(@Param('reference') reference: string) {
    const { call } = await this.yoecopay.getPayoutStatus(reference);
    return this.unwrap(call);
  }
}
