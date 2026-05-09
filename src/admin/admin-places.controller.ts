import {
  BadRequestException,
  Body,
  ConflictException,
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
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PlacesService } from '../places/places.service';

const PLACE_KINDS = ['hotel', 'restaurant', 'mall', 'landmark', 'experience'] as const;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,60}[a-z0-9]$/;

export class CreatePlaceDto {
  @IsString()
  @Matches(ID_PATTERN, {
    message: 'id must be lower-case slug (a-z, 0-9, hyphens), 2–62 chars.',
  })
  id!: string;

  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(200) tagline!: string;
  @IsIn(PLACE_KINDS) kind!: string;
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsString() @MaxLength(200) address!: string;
  @IsString() @MaxLength(60) phone!: string;
  @IsString() @MaxLength(120) hours!: string;
  @IsNumber() @Min(0) @Max(5) rating!: number;
  @IsString() @MaxLength(80) priceLabel!: string;
  @IsArray() @IsString({ each: true }) images!: string[];
  @IsArray() @IsString({ each: true }) tags!: string[];
  @IsString() about!: string;
  @IsOptional() @IsString() venueRef?: string | null;
  @IsOptional() @IsInt() @Min(0) experienceAdultUsd?: number;
}

export class UpdatePlaceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) tagline?: string;
  @IsOptional() @IsIn(PLACE_KINDS) kind?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) hours?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(80) priceLabel?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() about?: string;
  @IsOptional() @IsString() venueRef?: string | null;
  @IsOptional() @IsInt() @Min(0) experienceAdultUsd?: number;
}

@ApiTags('Admin · Places')
@ApiBearerAuth('access-token')
@Controller('admin/places')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminPlacesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly places: PlacesService,
  ) {}

  @Get()
  @RequirePermissions('places.read.admin')
  @ApiOperation({ summary: 'List places (admin)', description: 'Same shape as the public `/places` endpoint, gated by `places.read.admin` for parity with the rest of the admin API.' })
  list() {
    return this.places.findAll();
  }

  @Post()
  @RequirePermissions('places.write')
  @ApiOperation({ summary: 'Create place', description: 'Slug must be lower-case kebab-case (a-z, 0-9, hyphens), 2-62 chars, and cannot start or end with a hyphen. 409 if the slug already exists.' })
  async create(@Body() dto: CreatePlaceDto) {
    const exists = await this.prisma.place.findUnique({ where: { id: dto.id } });
    if (exists) throw new ConflictException(`Place '${dto.id}' already exists.`);
    await this.prisma.place.create({
      data: {
        id: dto.id,
        name: dto.name,
        tagline: dto.tagline,
        kind: dto.kind,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
        phone: dto.phone,
        hours: dto.hours,
        rating: dto.rating,
        priceLabel: dto.priceLabel,
        images: dto.images,
        tags: dto.tags,
        about: dto.about,
        venueRef: dto.venueRef ?? null,
        experienceAdultUsd: dto.experienceAdultUsd ?? 0,
      },
    });
    return this.places.findOne(dto.id);
  }

  @Patch(':id')
  @RequirePermissions('places.write')
  @ApiOperation({ summary: 'Update place', description: 'Partial update — every field is optional. The full record is returned.' })
  async update(@Param('id') id: string, @Body() dto: UpdatePlaceDto) {
    const exists = await this.prisma.place.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Place '${id}' not found.`);
    await this.prisma.place.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        tagline: dto.tagline ?? undefined,
        kind: dto.kind ?? undefined,
        latitude: dto.latitude ?? undefined,
        longitude: dto.longitude ?? undefined,
        address: dto.address ?? undefined,
        phone: dto.phone ?? undefined,
        hours: dto.hours ?? undefined,
        rating: dto.rating ?? undefined,
        priceLabel: dto.priceLabel ?? undefined,
        images: dto.images ?? undefined,
        tags: dto.tags ?? undefined,
        about: dto.about ?? undefined,
        venueRef: dto.venueRef !== undefined ? dto.venueRef : undefined,
        experienceAdultUsd: dto.experienceAdultUsd ?? undefined,
      },
    });
    return this.places.findOne(id);
  }

  @Delete(':id')
  @RequirePermissions('places.write')
  @ApiOperation({ summary: 'Delete place', description: 'Permanent removal from the discovery catalogue.' })
  async remove(@Param('id') id: string) {
    const exists = await this.prisma.place.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Place '${id}' not found.`);
    await this.prisma.place.delete({ where: { id } });
    return { ok: true };
  }
}
