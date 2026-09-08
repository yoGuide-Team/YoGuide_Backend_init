import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { HotelRoleGuard } from './hotel-role.guard';
import { generateShortCode } from '../common/short-code';

// ── DTOs ────────────────────────────────────────────────────────────────────

class UpdateHotelDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsArray()
  amenities?: string[];

  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

class CreateRoomDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalRooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  nightlyRateCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalRooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  nightlyRateCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

class UpdateBookingStatusDto {
  @IsString()
  status!: string;
}

// ── Include helpers ──────────────────────────────────────────────────────────

const BOOKING_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  hotel: { select: { id: true, name: true } },
  payment: true,
} satisfies Prisma.BookingInclude;

const ROOM_INCLUDE = {} satisfies Prisma.HotelRoomInclude;

// ── Controller ───────────────────────────────────────────────────────────────

/// Self-service endpoints for hotel managers — everything resolves through
/// the authenticated user's own Hotel record, never a client-supplied hotel id.
@ApiTags('Hotel · Manager')
@ApiBearerAuth('access-token')
@Controller('hotel')
@UseGuards(AuthGuard, HotelRoleGuard)
export class HotelController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Hotel Profile ──────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get my hotel profile' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { managerId: user.id },
      include: {
        rooms: true,
        _count: { select: { bookings: true } },
      },
    });
    if (!hotel) {
      throw new NotFoundException(
        'No hotel profile yet. Create one via POST /hotel/profile.',
      );
    }
    return hotel;
  }

  @Post('profile')
  @ApiOperation({ summary: 'Create my hotel profile' })
  async createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateHotelDto,
  ) {
    const existing = await this.prisma.hotel.findUnique({
      where: { managerId: user.id },
    });
    if (existing) throw new ConflictException('Hotel profile already exists.');

    if (!dto.name) {
      throw new BadRequestException('Hotel name is required.');
    }

    return this.prisma.hotel.create({
      data: {
        managerId: user.id,
        name: dto.name,
        description: dto.description,
        city: dto.city,
        address: dto.address,
        amenities: dto.amenities ?? [],
        checkInTime: dto.checkInTime,
        checkOutTime: dto.checkOutTime,
        contact: dto.contact,
        phone: dto.phone,
        website: dto.website,
        imageUrls: dto.imageUrls ?? [],
        code: await this.uniqueHotelCode(),
      },
      include: {
        rooms: true,
        _count: { select: { bookings: true } },
      },
    });
  }

  private async uniqueHotelCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateShortCode();
      const clash = await this.prisma.hotel.findUnique({ where: { code } });
      if (!clash) return code;
    }
    throw new Error('Could not generate a unique hotel code.');
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update my hotel profile' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateHotelDto,
  ) {
    const hotel = await this.requireHotel(user);
    return this.prisma.hotel.update({
      where: { id: hotel.id },
      data: {
        name: dto.name,
        description: dto.description,
        city: dto.city,
        address: dto.address,
        amenities: dto.amenities,
        checkInTime: dto.checkInTime,
        checkOutTime: dto.checkOutTime,
        contact: dto.contact,
        phone: dto.phone,
        website: dto.website,
        imageUrls: dto.imageUrls,
      },
      include: {
        rooms: true,
        _count: { select: { bookings: true } },
      },
    });
  }

  // ── Rooms ──────────────────────────────────────────────────

  @Get('rooms')
  @ApiOperation({ summary: 'List rooms for my hotel' })
  async listRooms(@CurrentUser() user: AuthenticatedUser) {
    const hotel = await this.requireHotel(user);
    return this.prisma.hotelRoom.findMany({
      where: { hotelId: hotel.id },
      include: ROOM_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Add a room type to my hotel' })
  async createRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomDto,
  ) {
    const hotel = await this.requireHotel(user);
    return this.prisma.hotelRoom.create({
      data: {
        hotelId: hotel.id,
        name: dto.name,
        totalRooms: dto.totalRooms ?? 0,
        nightlyRateCents: dto.nightlyRateCents ?? 0,
        currency: dto.currency ?? 'USD',
        amenities: dto.amenities ?? [],
        imageUrls: dto.imageUrls ?? [],
      },
      include: ROOM_INCLUDE,
    });
  }

  @Patch('rooms/:roomId')
  @ApiOperation({ summary: 'Update a room type' })
  async updateRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    const hotel = await this.requireHotel(user);
    const room = await this.prisma.hotelRoom.findFirst({
      where: { id: roomId, hotelId: hotel.id },
    });
    if (!room) throw new NotFoundException(`Room '${roomId}' not found.`);

    return this.prisma.hotelRoom.update({
      where: { id: roomId },
      data: {
        name: dto.name,
        totalRooms: dto.totalRooms,
        nightlyRateCents: dto.nightlyRateCents,
        currency: dto.currency,
        amenities: dto.amenities,
        imageUrls: dto.imageUrls,
      },
      include: ROOM_INCLUDE,
    });
  }

  @Delete('rooms/:roomId')
  @ApiOperation({ summary: 'Delete a room type' })
  async deleteRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId') roomId: string,
  ) {
    const hotel = await this.requireHotel(user);
    const room = await this.prisma.hotelRoom.findFirst({
      where: { id: roomId, hotelId: hotel.id },
    });
    if (!room) throw new NotFoundException(`Room '${roomId}' not found.`);

    await this.prisma.hotelRoom.delete({ where: { id: roomId } });
    return { ok: true };
  }

  // ── Bookings / Reservations ────────────────────────────────

  @Get('bookings')
  @ApiOperation({ summary: 'List bookings for my hotel' })
  async listBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: BookingStatus,
  ) {
    const hotel = await this.requireHotel(user);
    return this.prisma.booking.findMany({
      where: { hotelId: hotel.id, status: status || undefined },
      orderBy: { scheduleDate: 'asc' },
      include: BOOKING_INCLUDE,
    });
  }

  @Get('bookings/:bookingId')
  @ApiOperation({ summary: 'Get a specific booking for my hotel' })
  async getBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
  ) {
    const hotel = await this.requireHotel(user);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, hotelId: hotel.id },
      include: BOOKING_INCLUDE,
    });
    if (!booking) throw new NotFoundException(`Booking '${bookingId}' not found.`);
    return booking;
  }

  @Post('bookings/:bookingId/confirm')
  @ApiOperation({ summary: 'Confirm a pending hotel booking' })
  async confirmBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.transitionBooking(
      user,
      bookingId,
      [BookingStatus.PENDING],
      BookingStatus.CONFIRMED,
    );
  }

  @Post('bookings/:bookingId/cancel')
  @ApiOperation({ summary: 'Cancel a hotel booking' })
  async cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.transitionBooking(
      user,
      bookingId,
      [BookingStatus.PENDING, BookingStatus.CONFIRMED],
      BookingStatus.CANCELLED,
    );
  }

  @Post('bookings/:bookingId/complete')
  @ApiOperation({ summary: 'Mark a hotel booking as completed' })
  async completeBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.transitionBooking(
      user,
      bookingId,
      [BookingStatus.CONFIRMED],
      BookingStatus.COMPLETED,
    );
  }

  // ── Dashboard stats ────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard stats for my hotel' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    const hotel = await this.requireHotel(user);

    const [totalBookings, pendingBookings, confirmedBookings, roomCount] =
      await Promise.all([
        this.prisma.booking.count({ where: { hotelId: hotel.id } }),
        this.prisma.booking.count({
          where: { hotelId: hotel.id, status: BookingStatus.PENDING },
        }),
        this.prisma.booking.count({
          where: { hotelId: hotel.id, status: BookingStatus.CONFIRMED },
        }),
        this.prisma.hotelRoom.count({ where: { hotelId: hotel.id } }),
      ]);

    return {
      totalBookings,
      pendingBookings,
      confirmedBookings,
      roomCount,
      hotelName: hotel.name,
    };
  }

  // ── Helpers ────────────────────────────────────────────────

  private async requireHotel(user: AuthenticatedUser) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { managerId: user.id },
    });
    if (!hotel) {
      throw new NotFoundException(
        'No hotel profile yet. Create one via POST /hotel/profile.',
      );
    }
    return hotel;
  }

  private async transitionBooking(
    user: AuthenticatedUser,
    bookingId: string,
    allowedFrom: BookingStatus[],
    to: BookingStatus,
  ) {
    const hotel = await this.requireHotel(user);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, hotelId: hotel.id },
    });
    if (!booking) throw new NotFoundException(`Booking '${bookingId}' not found.`);
    if (!allowedFrom.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot move a ${booking.status} booking to ${to}.`,
      );
    }
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: to },
      include: BOOKING_INCLUDE,
    });
  }
}
