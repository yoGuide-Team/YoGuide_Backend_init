import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ApiErrorResponse } from '../common/responses';
import { CreateTripDto, TripResponse, UpdateTripDto } from './trips.dto';

const TRIP_INCLUDE = {
  region: { select: { id: true, name: true } },
} as const;

@ApiTags('Account')
@ApiBearerAuth('access-token')
@Controller('me/trips')
@UseGuards(AuthGuard)
export class MeTripsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List my trips' })
  @ApiOkResponse({ type: [TripResponse] })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.trip.findMany({
      where: { userId: user.id },
      orderBy: { arrivalDate: 'desc' },
      include: TRIP_INCLUDE,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my trips' })
  @ApiOkResponse({ type: TripResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, userId: user.id },
      include: TRIP_INCLUDE,
    });
    if (!trip) throw new NotFoundException(`Trip '${id}' not found.`);
    return trip;
  }

  @Post()
  @ApiOperation({ summary: 'Add a trip' })
  @ApiCreatedResponse({ type: TripResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTripDto) {
    const arrivalDate = new Date(dto.arrivalDate);
    const departureDate = new Date(dto.departureDate);
    this.assertValidDates(arrivalDate, departureDate);
    if (dto.regionId) await this.ensureRegion(dto.regionId);

    return this.prisma.trip.create({
      data: {
        userId: user.id,
        regionId: dto.regionId,
        label: dto.label?.trim(),
        arrivalDate,
        departureDate,
        notes: dto.notes?.trim(),
      },
      include: TRIP_INCLUDE,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one of my trips' })
  @ApiOkResponse({ type: TripResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
  ) {
    const existing = await this.prisma.trip.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) throw new NotFoundException(`Trip '${id}' not found.`);

    const arrivalDate = dto.arrivalDate ? new Date(dto.arrivalDate) : existing.arrivalDate;
    const departureDate = dto.departureDate
      ? new Date(dto.departureDate)
      : existing.departureDate;
    this.assertValidDates(arrivalDate, departureDate);

    if (dto.regionId) await this.ensureRegion(dto.regionId);

    return this.prisma.trip.update({
      where: { id },
      data: {
        regionId: dto.regionId,
        label: dto.label !== undefined ? dto.label.trim() : undefined,
        arrivalDate: dto.arrivalDate ? arrivalDate : undefined,
        departureDate: dto.departureDate ? departureDate : undefined,
        notes: dto.notes !== undefined ? dto.notes.trim() : undefined,
      },
      include: TRIP_INCLUDE,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of my trips' })
  @ApiOkResponse({ description: 'Trip deleted.' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const existing = await this.prisma.trip.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) throw new NotFoundException(`Trip '${id}' not found.`);

    await this.prisma.trip.delete({ where: { id } });
    return { ok: true };
  }

  private assertValidDates(arrivalDate: Date, departureDate: Date) {
    if (departureDate < arrivalDate) {
      throw new BadRequestException('departureDate must be on or after arrivalDate.');
    }
  }

  private async ensureRegion(regionId: string) {
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException(`Region '${regionId}' not found.`);
  }
}
