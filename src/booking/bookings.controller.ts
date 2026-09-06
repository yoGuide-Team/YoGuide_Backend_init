import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BookingStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AvailabilityService } from '../availability/availability.service';
import { BookingPaymentsService } from '../payments/booking-payments.service';
import { RefundService } from '../payments/refund.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { generateShortCode } from '../common/short-code';
import { isValidTimeString, startOfUtcDay } from '../common/dates';

class CreateBookingDto {
  @IsString()
  guideId!: string;

  @IsDateString()
  scheduleDate!: string;

  /// Local wall-clock start time, validated against the provider's
  /// availability window for that weekday.
  @IsOptional()
  @IsString()
  startTime?: string;

  /// Guests on this booking. Drives capacity, and for gastronomy also
  /// pricing (where it must equal partySize).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  guests?: number;

  // ── Tour/vehicle booking fields — required together for that path ──
  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  pickupLocation?: string;

  // ── Gastronomy booking fields — presence of partySize selects this path ──
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  partySize?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedCourseIds?: string[];

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

class InitiatePaymentDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  /// Makes retrying safe — a repeat with the same key returns the original
  /// attempt instead of opening a second checkout.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;
}

class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  starRating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

const BOOKING_INCLUDE = {
  package: { select: { id: true, name: true, durationHours: true, price: true, isCustom: true } },
  vehicle: true,
  guide: {
    include: {
      user: { select: { id: true, fullName: true, profileImage: true } },
      chefProfile: true,
    },
  },
  hotel: { select: { id: true, name: true, address: true, city: true } },
  selectedCourses: { include: { course: true } },
  payment: true,
  review: true,
} satisfies Prisma.BookingInclude;

/// Tourist-facing bookings. Every record is linked to the authenticated
/// user — the client never supplies a userId, and users can only see and
/// cancel their own bookings.
@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly payments: BookingPaymentsService,
    private readonly refunds: RefundService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post('bookings')
  @ApiOperation({
    summary: 'Book a package or a gastronomy experience (price and availability decided server-side)',
    description:
      'Two mutually-exclusive shapes, selected by whether partySize is present. Tour/vehicle: ' +
      'packageId + vehicleId + pickupLocation required, no partySize. Gastronomy: partySize ' +
      'required (+ optional selectedCourseIds), no packageId/vehicleId. ' +
      'The provider’s availability and remaining capacity are checked inside a serializable ' +
      'transaction, so concurrent requests cannot overbook the same date.',
  })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto) {
    const scheduleDate = startOfUtcDay(dto.scheduleDate);
    if (Number.isNaN(scheduleDate.getTime())) {
      throw new BadRequestException('scheduleDate is not a valid date.');
    }
    if (new Date(dto.scheduleDate).getTime() <= Date.now()) {
      throw new BadRequestException('scheduleDate must be in the future.');
    }
    if (dto.startTime && !isValidTimeString(dto.startTime)) {
      throw new BadRequestException('startTime must be in HH:mm format.');
    }
    if (dto.partySize != null && dto.guests != null && dto.guests !== dto.partySize) {
      throw new BadRequestException('guests and partySize must match for a gastronomy booking.');
    }

    // Free any slots whose payment window lapsed, so a stale hold does not
    // block a legitimate booking.
    await this.availability.expireLapsedHolds();

    const guide = await this.prisma.guideProfile.findUnique({
      where: { id: dto.guideId },
      include: { chefProfile: { include: { priceTiers: true, courses: true } } },
    });
    if (!guide) throw new NotFoundException(`Guide '${dto.guideId}' not found.`);

    const isGastronomy = dto.partySize != null;
    const guests = isGastronomy ? dto.partySize! : (dto.guests ?? 1);

    const priced = isGastronomy
      ? await this.priceGastronomy(dto, guide)
      : await this.priceTour(dto, user);

    // Serializable: the capacity read and the booking write must be one
    // atomic unit or two concurrent bookings can each see the last free
    // seat. Postgres aborts the loser, which surfaces as a retryable error.
    const booking = await this.prisma.$transaction(
      async (tx) => {
        await this.availability.assertBookable(tx, {
          guideId: guide.id,
          scheduleDate,
          guests,
          startTime: dto.startTime,
        });

        return tx.booking.create({
          data: {
            userId: user.id,
            guideId: guide.id,
            scheduleDate,
            startTime: dto.startTime,
            guests,
            reference: `YG-${generateShortCode(8)}`,
            totalDue: priced.totalDue,
            currency: 'USD',
            status: BookingStatus.PENDING,
            paymentMethod: dto.paymentMethod,
            notes: dto.notes,
            // Hold the slot briefly even before payment starts, so a booking
            // left unpaid does not occupy the date indefinitely.
            holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
            ...(isGastronomy
              ? {
                  partySize: dto.partySize,
                  selectedCourses: {
                    create: priced.courseIds.map((courseId) => ({ courseId })),
                  },
                }
              : {
                  packageId: priced.packageId,
                  vehicleId: priced.vehicleId,
                  pickupLocation: dto.pickupLocation,
                }),
          },
          include: BOOKING_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
    );

    await this.announceCreated(booking.id, guide.id, guide.userId);
    return booking;
  }

  // ── Pricing (server-side; a client-supplied price is never read) ──

  private async priceGastronomy(
    dto: CreateBookingDto,
    guide: Prisma.GuideProfileGetPayload<{
      include: { chefProfile: { include: { priceTiers: true; courses: true } } };
    }>,
  ) {
    if (dto.packageId || dto.vehicleId) {
      throw new BadRequestException('packageId/vehicleId are not used for gastronomy bookings.');
    }
    if (!guide.chefProfile) {
      throw new BadRequestException('This guide does not offer gastronomy experiences.');
    }

    const tier = guide.chefProfile.priceTiers.find(
      (t) =>
        dto.partySize! >= t.minPartySize &&
        (t.maxPartySize == null || dto.partySize! <= t.maxPartySize),
    );
    if (!tier) {
      throw new BadRequestException('No pricing tier configured for this party size.');
    }

    let courseIds: string[] = [];
    if (dto.selectedCourseIds?.length) {
      const validIds = new Set(guide.chefProfile.courses.map((c) => c.id));
      courseIds = dto.selectedCourseIds.filter((id) => validIds.has(id));
      if (courseIds.length !== dto.selectedCourseIds.length) {
        throw new BadRequestException('One or more selected courses are invalid.');
      }
    }

    return {
      totalDue: tier.pricePerPersonUsd.mul(dto.partySize!),
      courseIds,
      packageId: undefined as string | undefined,
      vehicleId: undefined as string | undefined,
    };
  }

  private async priceTour(dto: CreateBookingDto, user: AuthenticatedUser) {
    if (!dto.packageId || !dto.vehicleId || !dto.pickupLocation) {
      throw new BadRequestException(
        'packageId, vehicleId and pickupLocation are required for tour bookings.',
      );
    }

    const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } });
    if (!pkg || (pkg.isCustom && pkg.createdById !== user.id)) {
      throw new NotFoundException(`Package '${dto.packageId}' not found.`);
    }
    if (!pkg.isActive) {
      throw new BadRequestException('This package is no longer available for booking.');
    }
    const guests = dto.guests ?? 1;
    if (pkg.maxGuests != null && guests > pkg.maxGuests) {
      throw new BadRequestException(`This package takes at most ${pkg.maxGuests} guests.`);
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle '${dto.vehicleId}' not found.`);
    if (guests > vehicle.seats) {
      throw new BadRequestException(
        `${vehicle.name} seats ${vehicle.seats}; you selected ${guests} guests.`,
      );
    }

    return {
      totalDue: pkg.price.add(this.vehicleCost(vehicle, pkg.durationHours)),
      courseIds: [] as string[],
      packageId: pkg.id as string | undefined,
      vehicleId: vehicle.id as string | undefined,
    };
  }

  // ── Reads (owner-scoped) ───────────────────────────────────

  @Get('me/bookings')
  @ApiOperation({ summary: 'List my bookings' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: BookingStatus,
  ) {
    return this.prisma.booking.findMany({
      where: { userId: user.id, status: status || undefined },
      orderBy: { createdAt: 'desc' },
      include: BOOKING_INCLUDE,
    });
  }

  @Get('me/bookings/:id')
  @ApiOperation({ summary: 'Get one of my bookings' })
  async getMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId: user.id },
      include: { ...BOOKING_INCLUDE, walletEntries: true, refunds: true },
    });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    return booking;
  }

  // ── Payment (server-verified only) ─────────────────────────

  @Post('bookings/:id/payment/initiate')
  @ApiOperation({
    summary: 'Start paying for my booking',
    description:
      'Opens a checkout session with the payment provider and returns its redirect URL. ' +
      'The booking is held as PROCESSING while payment is in flight. This endpoint cannot ' +
      'mark a booking paid — only a verified provider result can.',
  })
  initiatePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.payments.initiate({
      userId: user.id,
      bookingId: id,
      method: dto.paymentMethod,
      idempotencyKey: dto.idempotencyKey,
      customerPhone: dto.customerPhone,
    });
  }

  @Post('bookings/:id/payment/verify')
  @ApiOperation({
    summary: 'Ask the server to check this payment with the provider',
    description:
      'The server reads the authoritative status from the payment provider and applies it. ' +
      'Safe to poll. The request body carries no status — the client cannot influence the outcome.',
  })
  verifyPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payments.verify(id, user.id);
  }

  @Get('bookings/:id/payment')
  @ApiOperation({ summary: 'Current payment state for my booking' })
  async getPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId: user.id },
      include: { payment: true },
    });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    if (!booking.payment) return { bookingId: id, status: null, message: 'No payment started.' };
    return booking.payment;
  }

  // ── Cancellation & refunds ─────────────────────────────────

  @Get('bookings/:id/refund-quote')
  @ApiOperation({
    summary: 'What would be refunded if I cancelled now',
    description: 'Read-only. Evaluated server-side against the cancellation policy.',
  })
  async refundQuote(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const quote = await this.refunds.quote(id, user.id);
    return { ...quote, amount: quote.amount.toString() };
  }

  @Post('bookings/:id/cancel')
  @ApiOperation({
    summary: 'Cancel my booking',
    description:
      'Applies the cancellation policy server-side, records any refund due, and frees the ' +
      'provider’s capacity for that date.',
  })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    const result = await this.refunds.cancelBooking({
      bookingId: id,
      userId: user.id,
      requestedById: user.id,
      reason: dto?.reason,
    });
    return {
      booking: result.booking,
      refund: result.refund,
      policy: { rule: result.quote.rule, refundPercent: result.quote.refundPercent },
    };
  }

  // ── Reviews ────────────────────────────────────────────────

  @Post('bookings/:id/review')
  @ApiOperation({ summary: 'Leave a review for one of my completed bookings' })
  async createReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
  ) {
    const booking = await this.prisma.booking.findFirst({ where: { id, userId: user.id } });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('You can only review a completed booking.');
    }
    const existing = await this.prisma.review.findUnique({ where: { bookingId: id } });
    if (existing) throw new BadRequestException('You already reviewed this booking.');
    return this.prisma.review.create({
      data: {
        bookingId: id,
        userId: user.id,
        guideId: booking.guideId,
        packageId: booking.packageId,
        starRating: dto.starRating,
        message: dto.message,
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────

  private async announceCreated(bookingId: string, guideId: string, guideUserId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { id: true, fullName: true } },
        package: { select: { name: true } },
      },
    });
    if (!booking) return;
    const label = booking.package?.name ?? 'a yoGuide experience';
    const when = booking.scheduleDate.toISOString().slice(0, 10);

    await this.notifications.notifyMany([
      {
        userId: booking.userId,
        type: NotificationType.BookingCreated,
        title: 'Booking created',
        message: `Your booking for ${label} on ${when} is held. Complete payment to confirm it.`,
        transactionId: booking.id,
        actionLabel: 'Pay now',
        actionUrl: `/bookings/${booking.id}`,
      },
      {
        // The provider's own user id — never a broadcast to all providers.
        userId: guideUserId,
        type: NotificationType.ProviderNewBooking,
        title: 'New booking request',
        message: `${booking.user.fullName ?? 'A customer'} requested ${label} on ${when}.`,
        transactionId: booking.id,
        actionLabel: 'Review request',
        actionUrl: `/guide/bookings/${booking.id}`,
      },
    ]);
  }

  /// Day rate applies per full 24h; the remainder is billed hourly but
  /// never costs more than another full day.
  private vehicleCost(
    vehicle: { pricePerHour: Prisma.Decimal; pricePerDay: Prisma.Decimal },
    durationHours: number,
  ): Prisma.Decimal {
    const days = Math.floor(durationHours / 24);
    const remHours = durationHours % 24;
    const remainderHourly = vehicle.pricePerHour.mul(remHours);
    const remainder = remainderHourly.gt(vehicle.pricePerDay)
      ? vehicle.pricePerDay
      : remainderHourly;
    return vehicle.pricePerDay.mul(days).add(remainder);
  }
}
