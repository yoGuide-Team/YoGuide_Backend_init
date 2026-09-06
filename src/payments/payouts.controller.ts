import {
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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AdminRoleGuard } from '../admin/guards/admin-role.guard';
import { GuideRoleGuard } from '../guide/guide-role.guard';
import { generateShortCode } from '../common/short-code';
import { PayoutService, maskMsisdn } from './payout.service';

class PayProviderDto {
  @IsString()
  guideId!: string;

  /// Whole RWF. The caller proposes an amount; the *destination* is never
  /// caller-supplied — it is resolved from the provider record.
  @IsInt()
  @IsPositive()
  amountRwf!: number;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class PayProviderDirectDto {
  /// The provider's public payment code — what their QR encodes.
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  code!: string;

  @IsInt()
  @IsPositive()
  amountRwf!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class UpdatePayoutDetailsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s-]{9,20}$/, { message: 'payoutMsisdn must be a valid phone number.' })
  payoutMsisdn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  payoutName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  payoutTelecomId?: string;
}

class VerifyPayoutDetailsDto {
  @IsBoolean()
  payoutVerified!: boolean;
}

/// Public payment-code lookup — what a provider's QR resolves to.
@ApiTags('Payouts')
@Controller('payouts')
export class PublicPayoutsController {
  constructor(private readonly payouts: PayoutService) {}

  @Get('resolve/:code')
  @ApiOperation({
    summary: 'Resolve a provider payment code',
    description:
      'Returns the payee\'s display name and a MASKED payout number, so a payer can ' +
      'confirm who they are paying and the app can pre-fill the payee. Never returns ' +
      'the full number. Mirrors POST /payments/initiate for hotel codes.',
  })
  resolve(@Param('code') code: string) {
    return this.payouts.resolvePaymentCode(code);
  }

  @Post('pay')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Pay a provider directly by their payment code',
    description:
      'Opens a checkout for the payer and records what the provider is owed. The payee ' +
      'is resolved from the code server-side — the caller never supplies a destination ' +
      'number, and the provider is not owed anything until the collection is verified.',
  })
  payDirect(@CurrentUser() user: AuthenticatedUser, @Body() dto: PayProviderDirectDto) {
    return this.payouts.collectForProvider({
      code: dto.code,
      amountRwf: dto.amountRwf,
      payerUserId: user.id,
      note: dto.note,
    });
  }

  @Post(':id/verify')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Check a direct payment with the provider',
    description:
      'The server reads the authoritative status. Scoped to the payer, so one traveller ' +
      'cannot poll or influence another payment. Safe to poll.',
  })
  verifyDirect(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payouts.verifyCollection(id, user.id);
  }
}

/// A provider managing their own payout destination.
@ApiTags('Guide · Payouts')
@ApiBearerAuth('access-token')
@Controller('guide/payouts')
@UseGuards(AuthGuard, GuideRoleGuard)
export class GuidePayoutsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutService,
  ) {}

  @Get('details')
  @ApiOperation({ summary: 'My payout destination (masked) and payment code' })
  async details(@CurrentUser() user: AuthenticatedUser) {
    const guide = await this.requireProfile(user);
    return {
      paymentCode: guide.paymentCode,
      payoutName: guide.payoutName,
      payoutTelecomId: guide.payoutTelecomId,
      // Even to the owner: the app has no reason to hold the full number,
      // and a screenshot of this screen should not leak it.
      msisdnMasked: guide.payoutMsisdn ? maskMsisdn(guide.payoutMsisdn) : null,
      payoutVerified: guide.payoutVerified,
    };
  }

  @Patch('details')
  @ApiOperation({
    summary: 'Set my payout destination',
    description:
      'Changing the number clears the verified flag — an admin must confirm it again ' +
      'before any money can be sent, so a hijacked account cannot silently redirect payouts.',
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePayoutDetailsDto,
  ) {
    const guide = await this.requireProfile(user);
    const numberChanged =
      dto.payoutMsisdn != null && dto.payoutMsisdn !== guide.payoutMsisdn;

    const updated = await this.prisma.guideProfile.update({
      where: { id: guide.id },
      data: {
        payoutMsisdn: dto.payoutMsisdn ?? undefined,
        payoutName: dto.payoutName ?? undefined,
        payoutTelecomId: dto.payoutTelecomId ?? undefined,
        ...(numberChanged ? { payoutVerified: false } : {}),
        // Issue a payment code on first setup so the provider has something
        // to put on a QR.
        ...(guide.paymentCode ? {} : { paymentCode: `YG${generateShortCode(6)}` }),
      },
    });

    return {
      paymentCode: updated.paymentCode,
      payoutName: updated.payoutName,
      msisdnMasked: updated.payoutMsisdn ? maskMsisdn(updated.payoutMsisdn) : null,
      payoutVerified: updated.payoutVerified,
      message: numberChanged
        ? 'Saved. An admin will verify the new number before payouts resume.'
        : 'Saved.',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Payouts sent to me' })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const guide = await this.requireProfile(user);
    return this.payouts.listForGuide(guide.id);
  }

  private async requireProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.guideProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      throw new NotFoundException('No guide profile yet. Create one with POST /guide/profile.');
    }
    return profile;
  }
}

/// Admin payout operations.
@ApiTags('Admin · Payouts')
@ApiBearerAuth('access-token')
@Controller('admin/payouts')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminPayoutsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List payouts' })
  @ApiQuery({ name: 'status', required: false, enum: PayoutStatus })
  async list(@Query('status') status?: PayoutStatus) {
    const rows = await this.prisma.payout.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        guide: {
          select: {
            id: true,
            companyName: true,
            user: { select: { fullName: true, email: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      guideId: r.guideId,
      provider: r.guide.companyName ?? r.guide.user.fullName,
      amount: r.amount.toString(),
      currency: r.currency,
      status: r.status,
      destination: maskMsisdn(r.destinationMsisdn),
      reference: r.reference,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  @Post()
  @ApiOperation({
    summary: 'Pay a provider',
    description:
      'The destination is resolved from the provider record — it cannot be supplied ' +
      'by the caller. Refused unless the provider has an admin-verified payout number.',
  })
  pay(@CurrentUser() admin: AuthenticatedUser, @Body() dto: PayProviderDto) {
    return this.payouts.payProvider({
      guideId: dto.guideId,
      amountRwf: dto.amountRwf,
      requestedById: admin.id,
      bookingId: dto.bookingId,
      note: dto.note,
    });
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Re-check a payout with the provider and apply the result' })
  verify(@Param('id') id: string) {
    return this.payouts.verify(id);
  }

  @Patch('providers/:guideId/verify-details')
  @ApiOperation({
    summary: "Confirm a provider's payout number",
    description:
      'Payouts are refused until this is set, so a typo or a hijacked profile cannot ' +
      'redirect money. Admins should confirm the number out of band first.',
  })
  async verifyDetails(
    @Param('guideId') guideId: string,
    @Body() dto: VerifyPayoutDetailsDto,
  ) {
    const guide = await this.prisma.guideProfile.findUnique({ where: { id: guideId } });
    if (!guide) throw new NotFoundException(`Provider '${guideId}' not found.`);
    if (dto.payoutVerified && !guide.payoutMsisdn) {
      throw new NotFoundException('This provider has no payout number to verify.');
    }
    const updated = await this.prisma.guideProfile.update({
      where: { id: guideId },
      data: { payoutVerified: dto.payoutVerified },
    });
    return {
      guideId: updated.id,
      payoutVerified: updated.payoutVerified,
      msisdnMasked: updated.payoutMsisdn ? maskMsisdn(updated.payoutMsisdn) : null,
    };
  }
}
