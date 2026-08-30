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
  Min,
  MinLength,
} from 'class-validator';
import { BookingStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class CreateBookingDto {
  @IsString()
  guideId!: string;

  @IsDateString()
  scheduleDate!: string;

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
  notes?: string;
}

class RecordPaymentDto {
  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  transactionRef?: string;
}

class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  starRating!: number;

  @IsOptional()
  @IsString()
  message?: string;
}

const CANCELLABLE: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

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
  constructor(private readonly prisma: PrismaService) {}

  @Post('bookings')
  @ApiOperation({
    summary: 'Book a package or a gastronomy experience (price computed server-side)',
    description:
      "Two mutually-exclusive shapes, selected by whether partySize is present. Tour/vehicle: " +
      "packageId + vehicleId + pickupLocation required, no partySize. Gastronomy: partySize " +
      'required (+ optional selectedCourseIds), no packageId/vehicleId.',
  })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto) {
    const scheduleDate = new Date(dto.scheduleDate);
    if (scheduleDate.getTime() <= Date.now()) {
      throw new BadRequestException('scheduleDate must be in the future.');
    }

    const guide = await this.prisma.guideProfile.findUnique({
      where: { id: dto.guideId },
      include: { chefProfile: { include: { priceTiers: true, courses: true } } },
    });
    if (!guide) throw new NotFoundException(`Guide '${dto.guideId}' not found.`);

    if (dto.partySize != null) {
      return this.createGastronomyBooking(user, dto, guide, scheduleDate);
    }
    return this.createTourBooking(user, dto, guide, scheduleDate);
  }

  private async createGastronomyBooking(
    user: AuthenticatedUser,
    dto: CreateBookingDto,
    guide: Prisma.GuideProfileGetPayload<{
      include: { chefProfile: { include: { priceTiers: true; courses: true } } };
    }>,
    scheduleDate: Date,
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

    const totalDue = tier.pricePerPersonUsd.mul(dto.partySize!);

    return this.prisma.booking.create({
      data: {
        userId: user.id,
        guideId: guide.id,
        scheduleDate,
        partySize: dto.partySize,
        totalDue,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        selectedCourses: { create: courseIds.map((courseId) => ({ courseId })) },
      },
      include: BOOKING_INCLUDE,
    });
  }

  private async createTourBooking(
    user: AuthenticatedUser,
    dto: CreateBookingDto,
    guide: { id: string },
    scheduleDate: Date,
  ) {
    if (!dto.packageId || !dto.vehicleId || !dto.pickupLocation) {
      throw new BadRequestException(
        'packageId, vehicleId and pickupLocation are required for tour bookings.',
      );
    }

    const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } });
    if (!pkg || (pkg.isCustom && pkg.createdById !== user.id)) {
      throw new NotFoundException(`Package '${dto.packageId}' not found.`);
    }
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle '${dto.vehicleId}' not found.`);

    const totalDue = pkg.price.add(this.vehicleCost(vehicle, pkg.durationHours));

    return this.prisma.booking.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        vehicleId: vehicle.id,
        guideId: guide.id,
        scheduleDate,
        pickupLocation: dto.pickupLocation,
        totalDue,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
      },
      include: BOOKING_INCLUDE,
    });
  }

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
      include: { ...BOOKING_INCLUDE, walletEntries: true },
    });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    return booking;
  }

  @Post('bookings/:id/cancel')
  @ApiOperation({ summary: 'Cancel my booking' })
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, userId: user.id } });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    if (!CANCELLABLE.includes(booking.status)) {
      throw new BadRequestException(`A ${booking.status} booking cannot be cancelled.`);
    }
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
      include: BOOKING_INCLUDE,
    });
  }

  @Post('bookings/:id/payment')
  @ApiOperation({ summary: 'Record the result of an online payment attempt for my booking' })
  async recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    const booking = await this.prisma.booking.findFirst({ where: { id, userId: user.id } });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    return this.prisma.payment.upsert({
      where: { bookingId: id },
      create: {
        bookingId: id,
        amount: booking.totalDue,
        status: dto.status,
        paymentMethod: dto.paymentMethod,
        transactionRef: dto.transactionRef,
      },
      update: {
        status: dto.status,
        paymentMethod: dto.paymentMethod,
        transactionRef: dto.transactionRef,
      },
    });
  }

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
