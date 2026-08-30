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
import { IsArray, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { parseAdminSort } from '../../common/admin-sort';

class CityBodyDto {
  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}

class UpdateCityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

class EventBodyDto {
  @IsString()
  @MinLength(1)
  cityId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsString()
  priceLabel?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsString()
  priceLabel?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/// Full CRUD for the City/Event models behind the public
/// GET /cities/:slug/events — without this there was no way for anyone to
/// ever populate that feature.
@ApiTags('Admin · Cities & Events')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminCitiesController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Cities ───────────────────────────────────────────────

  @Get('cities')
  @ApiOperation({ summary: 'List cities' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'name | slug' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  listCities(@Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.prisma.city.findMany({
      include: { _count: { select: { events: true } } },
      orderBy: parseAdminSort(sortBy, sortDir, ['name', 'slug'] as const, { name: 'asc' }),
    });
  }

  @Post('cities')
  @ApiOperation({ summary: 'Create a city' })
  async createCity(@Body() dto: CityBodyDto) {
    const clash = await this.prisma.city.findUnique({ where: { slug: dto.slug } });
    if (clash) throw new BadRequestException(`Slug '${dto.slug}' is already in use.`);
    return this.prisma.city.create({ data: { slug: dto.slug, name: dto.name } });
  }

  @Patch('cities/:id')
  @ApiOperation({ summary: 'Update a city' })
  async updateCity(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    await this.ensureCity(id);
    if (dto.slug) {
      const clash = await this.prisma.city.findFirst({ where: { slug: dto.slug, NOT: { id } } });
      if (clash) throw new BadRequestException(`Slug '${dto.slug}' is already in use.`);
    }
    return this.prisma.city.update({ where: { id }, data: dto });
  }

  @Delete('cities/:id')
  @ApiOperation({ summary: 'Delete a city (and its events)' })
  async removeCity(@Param('id') id: string) {
    await this.ensureCity(id);
    await this.prisma.event.deleteMany({ where: { cityId: id } });
    await this.prisma.city.delete({ where: { id } });
    return { ok: true };
  }

  // ── Events ───────────────────────────────────────────────

  @Get('events')
  @ApiOperation({ summary: 'List events' })
  @ApiQuery({ name: 'cityId', required: false })
  @ApiQuery({ name: 'sortBy', required: false, description: 'startsAt | title' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  listEvents(
    @Query('cityId') cityId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.prisma.event.findMany({
      where: { cityId: cityId || undefined },
      include: { city: { select: { id: true, name: true, slug: true } } },
      orderBy: parseAdminSort(sortBy, sortDir, ['startsAt', 'title'] as const, { startsAt: 'asc' }),
    });
  }

  @Post('events')
  @ApiOperation({ summary: 'Create an event' })
  async createEvent(@Body() dto: EventBodyDto) {
    await this.ensureCity(dto.cityId);
    return this.prisma.event.create({
      data: {
        cityId: dto.cityId,
        title: dto.title,
        venue: dto.venue,
        priceLabel: dto.priceLabel,
        startsAt: new Date(dto.startsAt),
        tags: dto.tags ?? [],
      },
    });
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Update an event' })
  async updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    await this.ensureEvent(id);
    return this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        venue: dto.venue,
        priceLabel: dto.priceLabel,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        tags: dto.tags,
      },
    });
  }

  @Delete('events/:id')
  @ApiOperation({ summary: 'Delete an event' })
  async removeEvent(@Param('id') id: string) {
    await this.ensureEvent(id);
    await this.prisma.event.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureCity(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException(`City '${id}' not found.`);
    return city;
  }

  private async ensureEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException(`Event '${id}' not found.`);
    return event;
  }
}
