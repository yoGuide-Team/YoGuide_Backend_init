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
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { BookingStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

// ── DTOs ────────────────────────────────────────────────────────────────────

class CreateHotelBookingDto {
  @IsString()
  @MinLength(1)
  roomId!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsInt()
  @Min(1)
  guests!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Hotels · Public')
@Controller('hotels')
export class HotelPublicController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Browse ────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all verified hotels' })
  async listHotels(@Query('city') city?: string) {
    const where: Prisma.HotelWhereInput = { isVerified: true };
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }
    return this.prisma.hotel.findMany({
      where,
      include: {
        rooms: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hotel details with rooms' })
  async getHotel(@Param('id') id: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id },
      include: {
        rooms: true,
        _count: { select: { bookings: true } },
      },
    });
    if (!hotel) throw new NotFoundException(`Hotel '${id}' not found.`);
    return hotel;
  }

  // ── Book ──────────────────────────────────────────────────

  @Post(':id/book')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Book a room at a hotel',
    description: 'Creates a PENDING hotel booking. Price is computed from the room\'s nightlyRateCents × number of nights.',
  })
  async bookRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Body() dto: CreateHotelBookingDto,
  ) {
    // 1. Verify hotel exists
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException(`Hotel '${hotelId}' not found.`);

    // 2. Verify room belongs to this hotel
    const room = await this.prisma.hotelRoom.findFirst({
      where: { id: dto.roomId, hotelId: hotel.id },
    });
    if (!room) throw new NotFoundException(`Room '${dto.roomId}' not found in this hotel.`);

    // 3. Validate dates
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    if (checkOut.getTime() <= checkIn.getTime()) {
      throw new BadRequestException('checkOut must be after checkIn.');
    }
    if (checkIn.getTime() <= Date.now()) {
      throw new BadRequestException('checkIn must be in the future.');
    }

    // 4. Calculate price: nightlyRateCents × number of nights
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    const totalCents = room.nightlyRateCents * nights;
    const totalDue = totalCents / 100; // Convert to dollars for the Decimal field

    // 5. Create booking
    const booking = await this.prisma.booking.create({
      data: {
        userId: user.id,
        hotelId: hotel.id,
        scheduleDate: checkIn,
        pickupLocation: room.name, // Reuse pickupLocation to store room type name
        partySize: dto.guests,
        totalDue: totalDue,
        status: BookingStatus.PENDING,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes
          ? `[Room: ${room.name}] ${dto.notes}`
          : `[Room: ${room.name}] ${nights} night${nights > 1 ? 's' : ''}, ${dto.guests} guest${dto.guests > 1 ? 's' : ''}`,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        hotel: { select: { id: true, name: true } },
      },
    });

    return {
      ...booking,
      room: { id: room.id, name: room.name, nightlyRateCents: room.nightlyRateCents, currency: room.currency },
      nights,
      totalCents,
    };
  }
}
