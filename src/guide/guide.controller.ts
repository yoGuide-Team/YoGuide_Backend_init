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
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BookingStatus, GuideType, Language, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GuideRoleGuard } from './guide-role.guard';

class CreateGuideProfileDto {
  @IsEnum(GuideType)
  guideType!: GuideType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Language, { each: true })
  languages?: Language[];
}

class UpdateGuideProfileDto {
  @IsOptional()
  @IsEnum(GuideType)
  guideType?: GuideType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Language, { each: true })
  languages?: Language[];
}

class LinkVehicleDto {
  @IsString()
  vehicleId!: string;
}

const GUIDE_BOOKING_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, profileImage: true } },
  package: { select: { id: true, name: true, durationHours: true, price: true } },
  vehicle: true,
  payment: true,
} satisfies Prisma.BookingInclude;

/// Self-service endpoints for guides — everything resolves through the
/// authenticated user's own GuideProfile, never a client-supplied guide id.
@ApiTags('Guide · Self-service')
@ApiBearerAuth('access-token')
@Controller('guide')
@UseGuards(AuthGuard, GuideRoleGuard)
export class GuideController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profile ────────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get my guide profile' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.guideProfile.findUnique({
      where: { userId: user.id },
      include: {
        vehicles: { include: { vehicle: true } },
        _count: { select: { reviews: true, bookings: true } },
      },
    });
    if (!profile) {
      throw new NotFoundException('No guide profile yet. Create one with POST /guide/profile.');
    }
    return profile;
  }

  @Post('profile')
  @ApiOperation({ summary: 'Create my guide profile' })
  async createProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGuideProfileDto) {
    const existing = await this.prisma.guideProfile.findUnique({ where: { userId: user.id } });
    if (existing) throw new ConflictException('Guide profile already exists.');
    if (dto.guideType === GuideType.COMPANY && !dto.companyName) {
      throw new BadRequestException('companyName is required for COMPANY guides.');
    }
    return this.prisma.guideProfile.create({
      data: {
        userId: user.id,
        guideType: dto.guideType,
        companyName: dto.companyName,
        languages: dto.languages ?? [],
      },
    });
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update my guide profile' })
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateGuideProfileDto) {
    const profile = await this.requireProfile(user);
    return this.prisma.guideProfile.update({
      where: { id: profile.id },
      data: {
        guideType: dto.guideType,
        companyName: dto.companyName,
        languages: dto.languages,
      },
    });
  }

  // ── Bookings ───────────────────────────────────────────────

  @Get('bookings')
  @ApiOperation({ summary: 'List bookings assigned to me' })
  async listBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: BookingStatus,
  ) {
    const profile = await this.requireProfile(user);
    return this.prisma.booking.findMany({
      where: { guideId: profile.id, status: status || undefined },
      orderBy: { scheduleDate: 'asc' },
      include: GUIDE_BOOKING_INCLUDE,
    });
  }

  @Post('bookings/:id/confirm')
  @ApiOperation({ summary: 'Confirm a pending booking' })
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transition(user, id, [BookingStatus.PENDING], BookingStatus.CONFIRMED);
  }

  @Post('bookings/:id/decline')
  @ApiOperation({ summary: 'Decline a pending booking' })
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transition(user, id, [BookingStatus.PENDING], BookingStatus.DECLINED);
  }

  @Post('bookings/:id/complete')
  @ApiOperation({ summary: 'Mark a confirmed booking as completed' })
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transition(user, id, [BookingStatus.CONFIRMED], BookingStatus.COMPLETED);
  }

  // ── Vehicles ───────────────────────────────────────────────

  @Get('vehicles')
  @ApiOperation({ summary: 'List vehicles linked to my profile' })
  async listVehicles(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    return this.prisma.guideVehicle.findMany({
      where: { guideId: profile.id },
      include: { vehicle: true },
    });
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Link a vehicle to my profile' })
  async linkVehicle(@CurrentUser() user: AuthenticatedUser, @Body() dto: LinkVehicleDto) {
    const profile = await this.requireProfile(user);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle '${dto.vehicleId}' not found.`);
    const existing = await this.prisma.guideVehicle.findUnique({
      where: { guideId_vehicleId: { guideId: profile.id, vehicleId: vehicle.id } },
    });
    if (existing) throw new ConflictException('Vehicle already linked.');
    return this.prisma.guideVehicle.create({
      data: { guideId: profile.id, vehicleId: vehicle.id },
      include: { vehicle: true },
    });
  }

  @Delete('vehicles/:vehicleId')
  @ApiOperation({ summary: 'Unlink a vehicle from my profile' })
  async unlinkVehicle(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId') vehicleId: string) {
    const profile = await this.requireProfile(user);
    const existing = await this.prisma.guideVehicle.findUnique({
      where: { guideId_vehicleId: { guideId: profile.id, vehicleId } },
    });
    if (!existing) throw new NotFoundException('Vehicle is not linked to your profile.');
    await this.prisma.guideVehicle.delete({
      where: { guideId_vehicleId: { guideId: profile.id, vehicleId } },
    });
    return { ok: true };
  }

  // ── Helpers ────────────────────────────────────────────────

  private async requireProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.guideProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      throw new NotFoundException('No guide profile yet. Create one with POST /guide/profile.');
    }
    return profile;
  }

  private async transition(
    user: AuthenticatedUser,
    bookingId: string,
    allowedFrom: BookingStatus[],
    to: BookingStatus,
  ) {
    const profile = await this.requireProfile(user);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, guideId: profile.id },
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
      include: GUIDE_BOOKING_INCLUDE,
    });
  }
}
