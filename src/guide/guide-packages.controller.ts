import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MediaType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GuideRoleGuard } from './guide-role.guard';

class CreateTourTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  regionId!: string;
}

class CreatePackageDto {
  @IsString()
  tourTypeId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description!: string;

  @IsInt()
  @Min(1)
  @Max(24 * 30)
  durationHours!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxGuests?: number;
}

class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  durationHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxGuests?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class PackageTourDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsInt()
  @Min(1)
  duration!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;
}

class PackageMediaDto {
  @IsString()
  @MaxLength(1000)
  url!: string;

  @IsOptional()
  @IsString()
  type?: MediaType;
}

const PACKAGE_INCLUDE = {
  tourType: { include: { region: true } },
  tours: true,
  media: true,
  _count: { select: { bookings: true, reviews: true } },
} satisfies Prisma.PackageInclude;

/// Provider-owned tour types and packages.
///
/// This is the ownership boundary Phase 7 asks for. Before this existed,
/// Package and TourType had no owner at all: only admins could create them
/// and any provider's dashboard showed the entire platform catalogue as
/// though it were their own.
///
/// Ownership rule, enforced on every mutating route:
///   • ownerId == my guide profile  → I may read, update and delete it.
///   • ownerId == null              → platform-owned; admin-managed, read-only here.
///   • ownerId == another provider  → 404, not 403. A provider should not be
///     able to probe for the existence of a competitor's package.
@ApiTags('Guide · Packages')
@ApiBearerAuth('access-token')
@Controller('guide')
@UseGuards(AuthGuard, GuideRoleGuard)
export class GuidePackagesController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tour types ─────────────────────────────────────────────

  @Get('tour-types')
  @ApiOperation({ summary: 'Tour types I can publish packages under (mine + platform ones)' })
  async listTourTypes(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    return this.prisma.tourType.findMany({
      where: { OR: [{ ownerId: profile.id }, { ownerId: null }] },
      include: { region: true, _count: { select: { packages: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('tour-types')
  @ApiOperation({ summary: 'Create a tour type I own' })
  async createTourType(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTourTypeDto) {
    const profile = await this.requireProfile(user);
    const region = await this.prisma.region.findUnique({ where: { id: dto.regionId } });
    if (!region) throw new NotFoundException(`Region '${dto.regionId}' not found.`);
    return this.prisma.tourType.create({
      data: { name: dto.name.trim(), regionId: region.id, ownerId: profile.id },
      include: { region: true },
    });
  }

  @Delete('tour-types/:id')
  @ApiOperation({ summary: 'Delete a tour type I own' })
  async deleteTourType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const profile = await this.requireProfile(user);
    const tourType = await this.prisma.tourType.findFirst({
      where: { id, ownerId: profile.id },
      include: { _count: { select: { packages: true } } },
    });
    if (!tourType) {
      throw new NotFoundException(`Tour type '${id}' not found.`);
    }
    if (tourType._count.packages > 0) {
      throw new BadRequestException(
        'This tour type still has packages. Delete or move them first.',
      );
    }
    await this.prisma.tourType.delete({ where: { id } });
    return { ok: true };
  }

  // ── Packages ───────────────────────────────────────────────

  @Get('packages')
  @ApiOperation({ summary: 'List the packages I own' })
  async listPackages(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    return this.prisma.package.findMany({
      where: { ownerId: profile.id },
      include: PACKAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('packages/:id')
  @ApiOperation({ summary: 'Get one of my packages' })
  async getPackage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const profile = await this.requireProfile(user);
    return this.requireOwnedPackage(profile.id, id);
  }

  @Post('packages')
  @ApiOperation({ summary: 'Create a package I own' })
  async createPackage(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePackageDto) {
    const profile = await this.requireProfile(user);

    // A package may sit under my own tour type or a platform one — but
    // never under a tour type owned by another provider.
    const tourType = await this.prisma.tourType.findFirst({
      where: { id: dto.tourTypeId, OR: [{ ownerId: profile.id }, { ownerId: null }] },
    });
    if (!tourType) throw new NotFoundException(`Tour type '${dto.tourTypeId}' not found.`);

    return this.prisma.package.create({
      data: {
        tourTypeId: tourType.id,
        name: dto.name.trim(),
        description: dto.description,
        durationHours: dto.durationHours,
        price: new Prisma.Decimal(dto.price),
        maxGuests: dto.maxGuests,
        ownerId: profile.id,
        isCustom: false,
      },
      include: PACKAGE_INCLUDE,
    });
  }

  @Patch('packages/:id')
  @ApiOperation({ summary: 'Update a package I own' })
  async updatePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    const profile = await this.requireProfile(user);
    await this.requireOwnedPackage(profile.id, id);
    return this.prisma.package.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        durationHours: dto.durationHours,
        price: dto.price != null ? new Prisma.Decimal(dto.price) : undefined,
        maxGuests: dto.maxGuests,
        isActive: dto.isActive,
      },
      include: PACKAGE_INCLUDE,
    });
  }

  @Delete('packages/:id')
  @ApiOperation({
    summary: 'Delete a package I own',
    description:
      'A package with bookings is withdrawn (isActive = false) rather than deleted, so ' +
      'historical bookings keep pointing at something real.',
  })
  async deletePackage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const profile = await this.requireProfile(user);
    const pkg = await this.requireOwnedPackage(profile.id, id);

    if (pkg._count.bookings > 0) {
      const withdrawn = await this.prisma.package.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        ok: true,
        deleted: false,
        withdrawn: true,
        message: `This package has ${pkg._count.bookings} booking(s), so it was withdrawn from the catalog instead of deleted.`,
        package: withdrawn,
      };
    }

    await this.prisma.$transaction([
      this.prisma.packageMedia.deleteMany({ where: { packageId: id } }),
      this.prisma.packageTour.deleteMany({ where: { packageId: id } }),
      this.prisma.package.delete({ where: { id } }),
    ]);
    return { ok: true, deleted: true };
  }

  // ── Package itinerary items & media ────────────────────────

  @Post('packages/:id/tours')
  @ApiOperation({ summary: 'Add an itinerary item to a package I own' })
  async addTour(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PackageTourDto,
  ) {
    const profile = await this.requireProfile(user);
    await this.requireOwnedPackage(profile.id, id);
    return this.prisma.packageTour.create({
      data: {
        packageId: id,
        title: dto.title.trim(),
        description: dto.description,
        duration: dto.duration,
        price: new Prisma.Decimal(dto.price),
      },
    });
  }

  @Delete('packages/:id/tours/:tourId')
  @ApiOperation({ summary: 'Remove an itinerary item from a package I own' })
  async removeTour(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tourId') tourId: string,
  ) {
    const profile = await this.requireProfile(user);
    await this.requireOwnedPackage(profile.id, id);
    const tour = await this.prisma.packageTour.findFirst({ where: { id: tourId, packageId: id } });
    if (!tour) throw new NotFoundException(`Itinerary item '${tourId}' not found.`);
    await this.prisma.packageTour.delete({ where: { id: tourId } });
    return { ok: true };
  }

  @Post('packages/:id/media')
  @ApiOperation({ summary: 'Attach media to a package I own' })
  async addMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PackageMediaDto,
  ) {
    const profile = await this.requireProfile(user);
    await this.requireOwnedPackage(profile.id, id);
    return this.prisma.packageMedia.create({
      data: { packageId: id, url: dto.url, type: dto.type ?? MediaType.IMAGE },
    });
  }

  @Delete('packages/:id/media/:mediaId')
  @ApiOperation({ summary: 'Remove media from a package I own' })
  async removeMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    const profile = await this.requireProfile(user);
    await this.requireOwnedPackage(profile.id, id);
    const media = await this.prisma.packageMedia.findFirst({
      where: { id: mediaId, packageId: id },
    });
    if (!media) throw new NotFoundException(`Media '${mediaId}' not found.`);
    await this.prisma.packageMedia.delete({ where: { id: mediaId } });
    return { ok: true };
  }

  // ── Helpers ────────────────────────────────────────────────

  /// Resolves a package that the caller owns. Reports 404 for a package
  /// owned by someone else so ownership cannot be probed; 403 only for the
  /// platform-owned case, where the resource's existence is already public.
  private async requireOwnedPackage(guideId: string, packageId: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      include: PACKAGE_INCLUDE,
    });
    if (!pkg) throw new NotFoundException(`Package '${packageId}' not found.`);
    if (pkg.ownerId === null) {
      throw new ForbiddenException(
        'This is a platform-managed package. Ask an admin to change it.',
      );
    }
    if (pkg.ownerId !== guideId) {
      throw new NotFoundException(`Package '${packageId}' not found.`);
    }
    return pkg;
  }

  private async requireProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.guideProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      throw new NotFoundException('No guide profile yet. Create one with POST /guide/profile.');
    }
    return profile;
  }
}
