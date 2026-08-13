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
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { MediaType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';

class PackageBodyDto {
  @IsString()
  tourTypeId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsInt()
  @Min(1)
  durationHours!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  tours?: Prisma.InputJsonValue;
}

class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  tours?: Prisma.InputJsonValue;
}

class PackageMediaBodyDto {
  @IsString()
  url!: string;

  @IsEnum(MediaType)
  type!: MediaType;
}

@ApiTags('Admin · Packages')
@ApiBearerAuth('access-token')
@Controller('admin/packages')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminPackagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List packages' })
  list(@Query('tourTypeId') tourTypeId?: string) {
    return this.prisma.package.findMany({
      where: tourTypeId ? { tourTypeId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        tourType: {
          select: { id: true, name: true, region: { select: { id: true, name: true } } },
        },
        media: true,
        _count: { select: { bookings: true, reviews: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get package by id' })
  async get(@Param('id') id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      include: { tourType: { include: { region: true } }, media: true },
    });
    if (!pkg) throw new NotFoundException(`Package '${id}' not found.`);
    return pkg;
  }

  @Post()
  @ApiOperation({ summary: 'Create package' })
  async create(@Body() dto: PackageBodyDto) {
    await this.ensureTourType(dto.tourTypeId);
    return this.prisma.package.create({
      data: {
        tourTypeId: dto.tourTypeId,
        name: dto.name,
        description: dto.description,
        durationHours: dto.durationHours,
        price: dto.price,
        tours: dto.tours,
      },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update package' })
  async update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    await this.ensureExists(id);
    return this.prisma.package.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete package' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const bookingCount = await this.prisma.booking.count({ where: { packageId: id } });
    if (bookingCount > 0) {
      throw new BadRequestException('Cannot delete a package with existing bookings.');
    }
    await this.prisma.packageMedia.deleteMany({ where: { packageId: id } });
    await this.prisma.package.delete({ where: { id } });
    return { ok: true };
  }

  @Get(':packageId/media')
  @ApiOperation({ summary: 'List package media' })
  async listMedia(@Param('packageId') packageId: string) {
    await this.ensureExists(packageId);
    return this.prisma.packageMedia.findMany({
      where: { packageId },
      orderBy: { id: 'asc' },
    });
  }

  @Post(':packageId/media')
  @ApiOperation({ summary: 'Add package media' })
  async addMedia(@Param('packageId') packageId: string, @Body() dto: PackageMediaBodyDto) {
    await this.ensureExists(packageId);
    return this.prisma.packageMedia.create({
      data: { packageId, url: dto.url, type: dto.type },
    });
  }

  @Patch(':packageId/media/:mediaId')
  @ApiOperation({ summary: 'Update package media' })
  async updateMedia(
    @Param('packageId') packageId: string,
    @Param('mediaId') mediaId: string,
    @Body() dto: PackageMediaBodyDto,
  ) {
    await this.ensureMedia(packageId, mediaId);
    return this.prisma.packageMedia.update({
      where: { id: mediaId },
      data: { url: dto.url, type: dto.type },
    });
  }

  @Delete(':packageId/media/:mediaId')
  @ApiOperation({ summary: 'Delete package media' })
  async removeMedia(@Param('packageId') packageId: string, @Param('mediaId') mediaId: string) {
    await this.ensureMedia(packageId, mediaId);
    await this.prisma.packageMedia.delete({ where: { id: mediaId } });
    return { ok: true };
  }

  private async ensureTourType(tourTypeId: string) {
    const tourType = await this.prisma.tourType.findUnique({ where: { id: tourTypeId } });
    if (!tourType) throw new NotFoundException(`Tour type '${tourTypeId}' not found.`);
  }

  private async ensureExists(id: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException(`Package '${id}' not found.`);
    return pkg;
  }

  private async ensureMedia(packageId: string, mediaId: string) {
    await this.ensureExists(packageId);
    const media = await this.prisma.packageMedia.findFirst({
      where: { id: mediaId, packageId },
    });
    if (!media) throw new NotFoundException(`Media '${mediaId}' not found on this package.`);
    return media;
  }
}
