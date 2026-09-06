import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
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
  @ApiQuery({
    name: 'sort',
    required: false,
    description: 'price_asc | price_desc | newest | duration_asc | duration_desc | rating',
  })
  async listPackages(
    @Query('tourTypeId') tourTypeId?: string,
    @Query('regionId') regionId?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    const orderBy: Prisma.PackageOrderByWithRelationInput | undefined =
      sort === 'price_asc'
        ? { price: 'asc' }
        : sort === 'price_desc'
          ? { price: 'desc' }
          : sort === 'duration_asc'
            ? { durationHours: 'asc' }
            : sort === 'duration_desc'
              ? { durationHours: 'desc' }
              : sort === 'rating'
                ? undefined // computed below, DB can't order by an aggregate here
                : { createdAt: 'desc' }; // 'newest' and default

    const packages = await this.prisma.package.findMany({
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
      orderBy,
      include: {
        tourType: {
          select: { id: true, name: true, region: { select: { id: true, name: true } } },
        },
        tours: true,
        media: true,
        reviews: { select: { starRating: true } },
        _count: { select: { reviews: true, bookings: true } },
      },
    });

    const withRating = packages.map((p) => ({
      ...p,
      rating: p.reviews.length ? p.reviews.reduce((s, r) => s + r.starRating, 0) / p.reviews.length : 0,
    }));
    if (sort === 'rating') withRating.sort((a, b) => b.rating - a.rating);
    return withRating;
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
        chefProfile: { select: { id: true } },
        availability: { where: { isActive: true }, select: { weekday: true } },
        bookings: { select: { status: true } },
        _count: { select: { reviews: true, bookings: true } },
      },
    });
    if (!guide) throw new NotFoundException(`Guide '${id}' not found.`);

    // Flattened/computed fields alongside the raw relations above, matching
    // the shape AppCompatController.listGuides() already computes for the
    // list view — so a client that fetched the list can fetch one detail
    // record here without a second, differently-shaped mapper.
    const ratings = guide.reviews.map((r) => r.starRating);
    const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const isChef = Boolean(guide.chefProfile);
    // Real completion/response figures, counted from this guide's own
    // bookings. city, responseRatePct and bio were previously hardcoded
    // identically for every guide; GuideProfile now carries real columns.
    const handled = guide.bookings.filter((b) => b.status !== 'PENDING').length;
    const responseRatePct = guide.bookings.length
      ? Math.round((handled / guide.bookings.length) * 100)
      : null;

    return {
      ...guide,
      fullName: guide.user.fullName,
      avatarUrl: guide.user.profileImage,
      emoji: isChef ? '👨‍🍳' : '🧭',
      city: guide.city,
      rating: Math.round(rating * 10) / 10,
      reviewCount: guide._count.reviews,
      toursCompleted: guide.bookings.filter((b) => b.status === 'COMPLETED').length,
      responseRatePct,
      isVerified: guide.isVerified,
      isAvailable: guide.availability.length > 0,
      specialties: isChef ? ['#Food'] : [],
      bio: guide.bio ?? (guide.companyName ? `Guide at ${guide.companyName}` : ''),
    };
  }

  // GET /guides/:id/availability moved to PublicAvailabilityController
  // (src/availability/availability.controller.ts). The stub that used to
  // live here reported the next 14 days as unconditionally available for
  // every guide; it is now computed from the provider's real weekly
  // schedule, blocked dates, and already-committed bookings.
}
