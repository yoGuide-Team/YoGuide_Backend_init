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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

const VEHICLE_TYPES = ['motorbike', 'ev_car', 'walking', 'minivan'] as const;

class CreateTourDto {
  @IsString() @MinLength(3) title!: string;
  @IsString() @MinLength(10) description!: string;
  @IsIn(VEHICLE_TYPES) vehicleType!: string;
  @IsInt() @Min(15) durationMinutes!: number;
  @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() cityId?: string;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

class UpdateTourDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(VEHICLE_TYPES) vehicleType?: string;
  @IsOptional() @IsInt() @Min(15) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsString() cityId?: string;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

class TourStopDto {
  @IsInt() @Min(1) ordinal!: number;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(5) durationMinutes?: number;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsString() placeId?: string;
}

@ApiTags('Public · Tours')
@Controller('tours')
export class ToursController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List published tours',
    description:
      'Tour packages — moto, EV-car, walking, minivan. Includes full stop list per tour. Filterable by city or vehicle type.',
  })
  @ApiQuery({ name: 'cityId', required: false })
  @ApiQuery({ name: 'vehicleType', required: false, enum: [...VEHICLE_TYPES] })
  async list(
    @Query('cityId') cityId?: string,
    @Query('vehicleType') vehicleType?: string,
  ) {
    return this.prisma.tour.findMany({
      where: {
        isPublished: true,
        cityId: cityId || undefined,
        vehicleType: vehicleType || undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        stops: { orderBy: { ordinal: 'asc' } },
        city: { select: { slug: true, name: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tour with stops' })
  async detail(@Param('id') id: string) {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      include: {
        stops: { orderBy: { ordinal: 'asc' } },
        city: { select: { slug: true, name: true } },
      },
    });
    if (!tour) throw new NotFoundException(`Tour '${id}' not found.`);
    return tour;
  }
}

@ApiTags('Admin · Tours')
@ApiBearerAuth('access-token')
@Controller('admin/tours')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminToursController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('tours.read.admin')
  @ApiOperation({ summary: 'List all tours (admin)', description: 'Includes unpublished tours.' })
  list() {
    return this.prisma.tour.findMany({
      orderBy: { createdAt: 'desc' },
      include: { stops: { orderBy: { ordinal: 'asc' } } },
    });
  }

  @Post()
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Create tour' })
  async create(@Body() dto: CreateTourDto) {
    return this.prisma.tour.create({
      data: { ...dto, highlights: dto.highlights ?? [] },
      include: { stops: true },
    });
  }

  @Patch(':id')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Update tour' })
  async update(@Param('id') id: string, @Body() dto: UpdateTourDto) {
    const exists = await this.prisma.tour.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Tour '${id}' not found.`);
    return this.prisma.tour.update({
      where: { id },
      data: dto,
      include: { stops: { orderBy: { ordinal: 'asc' } } },
    });
  }

  @Delete(':id')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Delete tour' })
  async remove(@Param('id') id: string) {
    const exists = await this.prisma.tour.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Tour '${id}' not found.`);
    await this.prisma.tour.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/stops')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Add stop to tour' })
  async addStop(@Param('id') id: string, @Body() dto: TourStopDto) {
    const tour = await this.prisma.tour.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException(`Tour '${id}' not found.`);
    return this.prisma.tourStop.create({
      data: { tourId: id, ...dto },
    });
  }

  @Patch(':tourId/stops/:stopId')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Update tour stop' })
  async updateStop(
    @Param('tourId') tourId: string,
    @Param('stopId') stopId: string,
    @Body() dto: TourStopDto,
  ) {
    const stop = await this.prisma.tourStop.findUnique({ where: { id: stopId } });
    if (!stop || stop.tourId !== tourId) {
      throw new NotFoundException(`Stop not found on tour '${tourId}'.`);
    }
    return this.prisma.tourStop.update({ where: { id: stopId }, data: dto });
  }

  @Delete(':tourId/stops/:stopId')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Delete tour stop' })
  async deleteStop(
    @Param('tourId') tourId: string,
    @Param('stopId') stopId: string,
  ) {
    const stop = await this.prisma.tourStop.findUnique({ where: { id: stopId } });
    if (!stop || stop.tourId !== tourId) {
      throw new NotFoundException(`Stop not found on tour '${tourId}'.`);
    }
    await this.prisma.tourStop.delete({ where: { id: stopId } });
    return { ok: true };
  }
}
