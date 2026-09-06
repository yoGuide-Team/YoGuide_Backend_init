import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GuideRoleGuard } from '../guide/guide-role.guard';
import { AvailabilityService } from './availability.service';
import { isValidTimeString, minutesFromTimeString, startOfUtcDay } from '../common/dates';

class WeeklyRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class BlockDateDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

class DailyCapacityDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  dailyCapacity!: number;
}

/// Public availability for the booking calendar. Replaces the old stub on
/// CatalogController that reported 14 always-free days for every guide.
@ApiTags('Availability')
@Controller()
export class PublicAvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('guides/:id/availability')
  @ApiOperation({
    summary: "A provider's real availability calendar",
    description:
      'Computed from the provider’s weekly schedule, one-off blocked dates, and guests ' +
      'already committed by bookings that hold capacity.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD; defaults to today' })
  @ApiQuery({ name: 'days', required: false, description: '1–180; defaults to 30' })
  async calendar(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('days') days?: string,
  ) {
    const span = days ? Number(days) : 30;
    if (Number.isNaN(span)) throw new BadRequestException('days must be a number.');
    const items = await this.availability.getCalendar(id, from, span);
    return { guideId: id, days: items };
  }
}

/// Provider self-service availability. Every route resolves through the
/// caller's own GuideProfile — a provider can only ever read or change
/// their own calendar.
@ApiTags('Guide · Availability')
@ApiBearerAuth('access-token')
@Controller('guide/availability')
@UseGuards(AuthGuard, GuideRoleGuard)
export class GuideAvailabilityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My weekly schedule, blocked dates and default capacity' })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    const [weekly, blocked] = await Promise.all([
      this.prisma.providerAvailability.findMany({
        where: { guideId: profile.id },
        orderBy: { weekday: 'asc' },
      }),
      this.prisma.availabilityException.findMany({
        where: { guideId: profile.id, date: { gte: startOfUtcDay(new Date()) } },
        orderBy: { date: 'asc' },
      }),
    ]);
    return { dailyCapacity: profile.dailyCapacity, weekly, blockedDates: blocked };
  }

  @Get('calendar')
  @ApiOperation({ summary: 'My computed availability calendar, including bookings taken' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'days', required: false })
  async calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('days') days?: string,
  ) {
    const profile = await this.requireProfile(user);
    return {
      guideId: profile.id,
      days: await this.availability.getCalendar(profile.id, from, days ? Number(days) : 30),
    };
  }

  @Put('daily-capacity')
  @ApiOperation({ summary: 'Set my default guests-per-day capacity' })
  async setCapacity(@CurrentUser() user: AuthenticatedUser, @Body() dto: DailyCapacityDto) {
    const profile = await this.requireProfile(user);
    return this.prisma.guideProfile.update({
      where: { id: profile.id },
      data: { dailyCapacity: dto.dailyCapacity },
      select: { id: true, dailyCapacity: true },
    });
  }

  @Put('weekly')
  @ApiOperation({
    summary: 'Create or update one weekday rule',
    description: 'weekday 0 = Sunday … 6 = Saturday. A weekday with no rule is not bookable.',
  })
  async upsertWeekly(@CurrentUser() user: AuthenticatedUser, @Body() dto: WeeklyRuleDto) {
    const profile = await this.requireProfile(user);
    this.assertWindow(dto.startTime, dto.endTime);
    return this.prisma.providerAvailability.upsert({
      where: { guideId_weekday: { guideId: profile.id, weekday: dto.weekday } },
      create: {
        guideId: profile.id,
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        capacity: dto.capacity,
        isActive: dto.isActive ?? true,
      },
      update: {
        startTime: dto.startTime,
        endTime: dto.endTime,
        capacity: dto.capacity,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Delete('weekly/:weekday')
  @ApiOperation({ summary: 'Remove a weekday rule (making that weekday unbookable)' })
  async deleteWeekly(@CurrentUser() user: AuthenticatedUser, @Param('weekday') weekday: string) {
    const profile = await this.requireProfile(user);
    const day = Number(weekday);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new BadRequestException('weekday must be an integer 0–6.');
    }
    const existing = await this.prisma.providerAvailability.findUnique({
      where: { guideId_weekday: { guideId: profile.id, weekday: day } },
    });
    if (!existing) throw new NotFoundException('No rule set for that weekday.');
    await this.prisma.providerAvailability.delete({
      where: { guideId_weekday: { guideId: profile.id, weekday: day } },
    });
    return { ok: true };
  }

  @Post('block')
  @ApiOperation({ summary: 'Block a date, or override its capacity' })
  async block(@CurrentUser() user: AuthenticatedUser, @Body() dto: BlockDateDto) {
    const profile = await this.requireProfile(user);
    const date = startOfUtcDay(dto.date);
    const isBlocked = dto.isBlocked ?? true;

    if (isBlocked) {
      // Refuse to blank out a day that already has committed guests — the
      // provider must handle those bookings explicitly rather than have
      // them silently orphaned.
      const committed = await this.prisma.booking.count({
        where: {
          guideId: profile.id,
          scheduleDate: date,
          status: { in: ['PENDING', 'PROCESSING', 'CONFIRMED'] },
        },
      });
      if (committed > 0) {
        throw new BadRequestException(
          `You have ${committed} active booking(s) on this date. Decline or complete them before blocking it.`,
        );
      }
    }

    return this.prisma.availabilityException.upsert({
      where: { guideId_date: { guideId: profile.id, date } },
      create: {
        guideId: profile.id,
        date,
        isBlocked,
        capacity: dto.capacity,
        reason: dto.reason,
      },
      update: { isBlocked, capacity: dto.capacity, reason: dto.reason },
    });
  }

  @Delete('block/:date')
  @ApiOperation({ summary: 'Remove a date override (YYYY-MM-DD)' })
  async unblock(@CurrentUser() user: AuthenticatedUser, @Param('date') dateInput: string) {
    const profile = await this.requireProfile(user);
    const date = startOfUtcDay(dateInput);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('date must be YYYY-MM-DD.');
    const existing = await this.prisma.availabilityException.findUnique({
      where: { guideId_date: { guideId: profile.id, date } },
    });
    if (!existing) throw new NotFoundException('No override set for that date.');
    await this.prisma.availabilityException.delete({
      where: { guideId_date: { guideId: profile.id, date } },
    });
    return { ok: true };
  }

  private assertWindow(startTime?: string, endTime?: string) {
    if (startTime && !isValidTimeString(startTime)) {
      throw new BadRequestException('startTime must be HH:mm.');
    }
    if (endTime && !isValidTimeString(endTime)) {
      throw new BadRequestException('endTime must be HH:mm.');
    }
    const from = minutesFromTimeString(startTime);
    const to = minutesFromTimeString(endTime);
    if (from != null && to != null && to <= from) {
      throw new BadRequestException('endTime must be after startTime.');
    }
  }

  private async requireProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.guideProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      throw new NotFoundException('No guide profile yet. Create one with POST /guide/profile.');
    }
    return profile;
  }
}
