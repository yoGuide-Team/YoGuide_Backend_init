import {
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
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

class CreateEventDto {
  @IsString() cityId!: string;
  @IsString() @MinLength(2) title!: string;
  @IsString() @MinLength(10) description!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() priceLabel?: string;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

class UpdateEventDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() priceLabel?: string;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

@ApiTags('Public · Events')
@Controller('events')
export class EventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Upcoming events',
    description: "Default returns events that haven't ended yet, sorted by start date.",
  })
  @ApiQuery({ name: 'cityId', required: false })
  @ApiQuery({ name: 'tag', required: false })
  list(
    @Query('cityId') cityId?: string,
    @Query('tag') tag?: string,
  ) {
    return this.prisma.event.findMany({
      where: {
        cityId: cityId || undefined,
        startsAt: { gte: new Date(Date.now() - 86400000) },
        tags: tag ? { has: tag } : undefined,
      },
      orderBy: { startsAt: 'asc' },
      include: { city: { select: { slug: true, name: true } } },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event detail' })
  async detail(@Param('id') id: string) {
    const e = await this.prisma.event.findUnique({
      where: { id },
      include: { city: { select: { slug: true, name: true } } },
    });
    if (!e) throw new NotFoundException('Event not found.');
    return e;
  }
}

@ApiTags('Admin · Events')
@ApiBearerAuth('access-token')
@Controller('admin/events')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminEventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('events.read')
  @ApiOperation({ summary: 'List all events (admin)' })
  list() {
    return this.prisma.event.findMany({
      orderBy: { startsAt: 'desc' },
      include: { city: { select: { slug: true, name: true } } },
    });
  }

  @Post()
  @RequirePermissions('events.write')
  @ApiOperation({ summary: 'Create event' })
  async create(@Body() dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        cityId: dto.cityId,
        title: dto.title,
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        venue: dto.venue,
        priceLabel: dto.priceLabel ?? 'Free',
        coverImage: dto.coverImage,
        tags: dto.tags ?? [],
      },
    });
  }

  @Patch(':id')
  @RequirePermissions('events.write')
  @ApiOperation({ summary: 'Update event' })
  async update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    const e = await this.prisma.event.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Event not found.');
    return this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        venue: dto.venue ?? undefined,
        priceLabel: dto.priceLabel ?? undefined,
        coverImage: dto.coverImage ?? undefined,
        tags: dto.tags ?? undefined,
      },
    });
  }

  @Delete(':id')
  @RequirePermissions('events.write')
  @ApiOperation({ summary: 'Delete event' })
  async remove(@Param('id') id: string) {
    const e = await this.prisma.event.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Event not found.');
    await this.prisma.event.delete({ where: { id } });
    return { ok: true };
  }
}
