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
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BookingStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class CreateBookingDto {
  @IsString()
  packageId!: string;

  @IsString()
  vehicleId!: string;

  @IsString()
  guideId!: string;

  @IsDateString()
  scheduleDate!: string;

  @IsString()
  @MinLength(2)
  pickupLocation!: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}

const CANCELLABLE: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

const BOOKING_INCLUDE = {
  package: { select: { id: true, name: true, durationHours: true, price: true, isCustom: true } },
  vehicle: true,
  guide: { include: { user: { select: { id: true, fullName: true, profileImage: true } } } },
  payment: true,
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
  @ApiOperation({ summary: 'Book a package (price computed server-side)' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto) {
    const scheduleDate = new Date(dto.scheduleDate);
    if (scheduleDate.getTime() <= Date.now()) {
      throw new BadRequestException('scheduleDate must be in the future.');
    }

    const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } });
    if (!pkg || (pkg.isCustom && pkg.createdById !== user.id)) {
      throw new NotFoundException(`Package '${dto.packageId}' not found.`);
    }
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle '${dto.vehicleId}' not found.`);
    const guide = await this.prisma.guideProfile.findUnique({ where: { id: dto.guideId } });
    if (!guide) throw new NotFoundException(`Guide '${dto.guideId}' not found.`);

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
