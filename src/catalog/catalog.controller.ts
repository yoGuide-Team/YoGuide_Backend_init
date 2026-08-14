import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/// Public, unauthenticated catalog browsing for the mobile/web apps.
/// Custom packages (isCustom) never appear here — they belong to their
/// creator and are served under /me/packages.
@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('regions')
  @ApiOperation({ summary: 'List regions with their tour types' })
  listRegions() {
    return this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: { tourTypes: { select: { id: true, name: true } } },
    });
  }

  @Get('languages')
  @ApiOperation({ summary: 'List supported languages' })
  listLanguages() {
    return [
      { code: 'EN', label: 'English' },
      { code: 'FR', label: 'Français' },
      { code: 'SW', label: 'Kiswahili' },
      { code: 'RW', label: 'Ikinyarwanda' },
    ];
  }

  @Get('visitor-types')
  @ApiOperation({ summary: 'List visitor types' })
  listVisitorTypes() {
    return [
      { value: 'VISITOR', label: 'Visitor – Leisure and Conference' },
      { value: 'INVESTOR', label: 'Visitor – Investor and Business' },
      { value: 'LAYOVER', label: 'Layover in KGL' },
      { value: 'EXPERT', label: 'Expats and Residents' },
    ];
  }

  @Get('tour-types')
  @ApiOperation({ summary: 'List tour types, optionally by region' })
  listTourTypes(@Query('regionId') regionId?: string) {
    return this.prisma.tourType.findMany({
      where: regionId ? { regionId } : undefined,
      orderBy: { name: 'asc' },
      include: {
        region: { select: { id: true, name: true } },
        _count: { select: { packages: true } },
      },
    });
  }

  @Get('packages')
  @ApiOperation({ summary: 'List public packages with tours and media' })
  listPackages(
    @Query('tourTypeId') tourTypeId?: string,
    @Query('regionId') regionId?: string,
    @Query('search') search?: string,
  ) {
    return this.prisma.package.findMany({
      where: {
        isCustom: false,
        tourTypeId: tourTypeId || undefined,
        tourType: regionId ? { regionId } : undefined,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        tourType: {
          select: { id: true, name: true, region: { select: { id: true, name: true } } },
        },
        tours: true,
        media: true,
        _count: { select: { reviews: true, bookings: true } },
      },
    });
  }

  @Get('packages/:id')
  @ApiOperation({ summary: 'Get a public package by id' })
  async getPackage(@Param('id') id: string) {
    const pkg = await this.prisma.package.findFirst({
      where: { id, isCustom: false },
      include: {
        tourType: { include: { region: true } },
        tours: true,
        media: true,
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, fullName: true, profileImage: true } } },
        },
      },
    });
    if (!pkg) throw new NotFoundException(`Package '${id}' not found.`);
    return pkg;
  }

  @Get('tours')
  @ApiOperation({ summary: 'List individual tours (building blocks for custom packages)' })
  listTours(@Query('packageId') packageId?: string, @Query('regionId') regionId?: string) {
    return this.prisma.packageTour.findMany({
      where: {
        packageId: packageId || undefined,
        package: {
          isCustom: false,
          ...(regionId ? { tourType: { regionId } } : {}),
        },
      },
      orderBy: { title: 'asc' },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            media: { select: { url: true, type: true } },
            tourType: {
              select: {
                id: true,
                name: true,
                regionId: true,
                region: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'List vehicles available for booking' })
  listVehicles() {
    return this.prisma.vehicle.findMany({ orderBy: { seats: 'asc' } });
  }

  @Get('guides')
  @ApiOperation({ summary: 'List guides' })
  listGuides(@Query('language') language?: string) {
    return this.prisma.guideProfile.findMany({
      where: language ? { languages: { has: language.toUpperCase() as never } } : undefined,
      include: {
        user: {
          select: { id: true, fullName: true, profileImage: true, nationality: true },
        },
        vehicles: { include: { vehicle: true } },
        _count: { select: { reviews: true, bookings: true } },
      },
    });
  }

  @Get('guides/:id')
  @ApiOperation({ summary: 'Get a guide by id' })
  async getGuide(@Param('id') id: string) {
    const guide = await this.prisma.guideProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, fullName: true, profileImage: true, nationality: true },
        },
        vehicles: { include: { vehicle: true } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, fullName: true, profileImage: true } } },
        },
        _count: { select: { reviews: true, bookings: true } },
      },
    });
    if (!guide) throw new NotFoundException(`Guide '${id}' not found.`);
    return guide;
  }
}
