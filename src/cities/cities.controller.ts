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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

class CreateCityDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{0,40}$/) slug!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() country!: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() description?: string;
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
}

class UpdateCityDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
}

@ApiTags('Public · Cities')
@Controller('cities')
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List cities',
    description:
      'Cities the platform covers, ordered by featured-first then alphabetical. Each city carries the discovery copy + cover image used by the apps.',
  })
  async list(@Query('featured') featured?: string) {
    return this.prisma.city.findMany({
      where: featured === 'true' ? { isFeatured: true } : undefined,
      orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
    });
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get city detail' })
  async detail(@Param('slug') slug: string) {
    const city = await this.prisma.city.findUnique({ where: { slug } });
    if (!city) throw new NotFoundException(`City '${slug}' not found.`);
    return city;
  }

  @Get(':slug/events')
  @ApiOperation({ summary: 'Upcoming events for a city' })
  async events(@Param('slug') slug: string) {
    const city = await this.prisma.city.findUnique({ where: { slug } });
    if (!city) throw new NotFoundException(`City '${slug}' not found.`);
    return this.prisma.event.findMany({
      where: { cityId: city.id, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
  }
}

@ApiTags('Admin · Cities')
@ApiBearerAuth('access-token')
@Controller('admin/cities')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminCitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @RequirePermissions('cities.write')
  @ApiOperation({ summary: 'Create city' })
  async create(@Body() dto: CreateCityDto) {
    const exists = await this.prisma.city.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new BadRequestException(`City '${dto.slug}' already exists.`);
    return this.prisma.city.create({ data: dto });
  }

  @Patch(':slug')
  @RequirePermissions('cities.write')
  @ApiOperation({ summary: 'Update city' })
  async update(@Param('slug') slug: string, @Body() dto: UpdateCityDto) {
    const exists = await this.prisma.city.findUnique({ where: { slug } });
    if (!exists) throw new NotFoundException(`City '${slug}' not found.`);
    return this.prisma.city.update({ where: { slug }, data: dto });
  }

  @Delete(':slug')
  @RequirePermissions('cities.write')
  @ApiOperation({ summary: 'Delete city' })
  async remove(@Param('slug') slug: string) {
    const exists = await this.prisma.city.findUnique({ where: { slug } });
    if (!exists) throw new NotFoundException(`City '${slug}' not found.`);
    await this.prisma.city.delete({ where: { slug } });
    return { ok: true };
  }
}
