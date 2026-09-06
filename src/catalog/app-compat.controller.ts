import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/// Flat `/tours` and `/guides` endpoints in the exact JSON shape the
/// Flutter app's `MotoTourPackage.fromJson` / `GuideProfile.fromJson`
/// already parse (see Tripoguide_app lib/shared/tours.dart). This lets the
/// app hydrate real catalog data through its existing repositories while
/// the richer /catalog/* API is adopted screen by screen.
@ApiTags('App compat')
@Controller()
export class AppCompatController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('tours')
  @ApiOperation({ summary: 'Packages in the mobile app tour-list shape' })
  async listTours(@Query('category') category?: string) {
    const packages = await this.prisma.package.findMany({
      where: { isCustom: false },
      orderBy: { createdAt: 'desc' },
      include: {
        tours: true,
        media: true,
        tourType: { include: { region: true } },
      },
    });
    // The app sends ?category=CITY (uppercase); match case-insensitively
    // against the derived category key.
    const wanted = category?.toLowerCase();
    const filtered = wanted
      ? packages.filter((pkg) => this.categoryKey(pkg.tourType.name) === wanted)
      : packages;
    return filtered.map((pkg) => {
      const images = pkg.media
        .filter((m) => m.type === 'IMAGE')
        .map((m) => m.url);
      return {
        id: pkg.id,
        title: pkg.name,
        description: pkg.description,
        durationMinutes: pkg.durationHours * 60,
        priceCents: Math.round(Number(pkg.price) * 100),
        currency: 'USD',
        vehicleType: null,
        category: this.categoryKey(pkg.tourType.name),
        citySlug: pkg.tourType.region.name.toLowerCase(),
        city: { name: pkg.tourType.region.name },
        coverImage: images[0] ?? null,
        images,
        highlights: pkg.tours.map((t) => t.title),
        stops: pkg.tours.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          durationMinutes: t.duration * 60,
          priceCents: Math.round(Number(t.price) * 100),
        })),
      };
    });
  }

  @Get('guides')
  @ApiOperation({ summary: 'Guide profiles in the mobile app guide-list shape' })
  @ApiQuery({
    name: 'sort',
    required: false,
    description: 'rating | tours_completed | response_rate | price_asc | price_desc',
  })
  async listGuides(@Query('sort') sort?: string) {
    const guides = await this.prisma.guideProfile.findMany({
      include: {
        user: { select: { fullName: true, profileImage: true } },
        reviews: { select: { starRating: true } },
        _count: { select: { bookings: true } },
        availability: { where: { isActive: true }, select: { weekday: true } },
        bookings: { select: { status: true } },
        chefProfile: {
          include: {
            category: true,
            courses: {
              orderBy: { sortOrder: 'asc' },
              include: { media: { orderBy: { sortOrder: 'asc' } } },
            },
            priceTiers: { orderBy: { minPartySize: 'asc' } },
          },
        },
        experiences: {
          include: { media: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        vehicles: { include: { vehicle: true } },
      },
    });
    const mapped = guides.map((g) => {
      const ratings = g.reviews.map((r) => r.starRating);
      const rating = ratings.length
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;
      // Chef extras live in the related ChefProfile. The app's gastronomy
      // flow filters on specialties containing '#Food' and reads the chef
      // fields directly off the guide row.
      const gastro = g.chefProfile;
      const lowestTierUsd = gastro?.priceTiers.length
        ? Math.min(...gastro.priceTiers.map((t) => t.pricePerPersonUsd.toNumber()))
        : null;
      // Real values from real columns. city, responseRatePct, isVerified
      // and isAvailable were previously hardcoded identically for every
      // guide regardless of the truth.
      const handled = g.bookings.filter((b) => b.status !== 'PENDING').length;
      const responseRatePct = g.bookings.length
        ? Math.round((handled / g.bookings.length) * 100)
        : null;
      return {
        id: g.id,
        userId: g.userId,
        fullName: g.user.fullName,
        emoji: gastro ? '👨‍🍳' : '🧭',
        avatarUrl: g.user.profileImage,
        city: g.city,
        rating: Math.round(rating * 10) / 10,
        reviewCount: ratings.length,
        toursCompleted: g.bookings.filter((b) => b.status === 'COMPLETED').length,
        responseRatePct,
        specialties: gastro ? ['#Food'] : [],
        languages: g.languages,
        bio: g.bio ?? (g.companyName ? `Guide at ${g.companyName}` : ''),
        hourlyRateCents: lowestTierUsd != null ? Math.round(lowestTierUsd * 100) : null,
        currency: 'USD',
        isVerified: g.isVerified,
        // "Available" now means the provider has opened at least one
        // weekday for bookings, rather than an unconditional true.
        isAvailable: g.availability.length > 0,
        // Every guide can have showcase Experiences, not just chefs — keep
        // this outside the `gastro ? ... : {}` block below.
        experiences: g.experiences.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          media: e.media.map((m) => ({ id: m.id, url: m.url, type: m.type })),
        })),
        // Vehicles this guide has actually linked to their profile — used
        // by the tour-booking flow's real vehicle picker.
        vehicles: g.vehicles.map((v) => ({
          id: v.vehicle.id,
          name: v.vehicle.name,
          icon: v.vehicle.icon,
          seats: v.vehicle.seats,
          pricePerHourUsd: v.vehicle.pricePerHour.toNumber(),
          pricePerDayUsd: v.vehicle.pricePerDay.toNumber(),
        })),
        ...(gastro
          ? {
              chefCategoryId: gastro.categoryId,
              chefCategoryName: gastro.category.name,
              restaurantName: gastro.restaurantName,
              experienceName: gastro.experienceName,
              gastronomyArea: gastro.area,
              chefTags: gastro.tags,
              introVideoUrl: gastro.introVideoUrl,
              menuCourses: gastro.courses.map((c) => ({
                id: c.id,
                course: c.name,
                description: c.description,
                imageUrl: c.imageUrl,
                media: c.media.map((m) => ({ id: m.id, url: m.url, type: m.type })),
              })),
              priceTiers: gastro.priceTiers.map((t) => ({
                minPartySize: t.minPartySize,
                maxPartySize: t.maxPartySize,
                pricePerPersonUsd: t.pricePerPersonUsd.toNumber(),
              })),
              story: gastro.storyTitle
                ? {
                    title: gastro.storyTitle,
                    durationLabel: gastro.storyDurationLabel,
                    text: gastro.storyText,
                  }
                : undefined,
            }
          : {}),
      };
    });

    const byPrice = (a: (typeof mapped)[number], b: (typeof mapped)[number]) => {
      const av = a.hourlyRateCents ?? Number.POSITIVE_INFINITY;
      const bv = b.hourlyRateCents ?? Number.POSITIVE_INFINITY;
      return av - bv;
    };
    switch (sort) {
      case 'rating':
        return mapped.sort((a, b) => b.rating - a.rating);
      case 'tours_completed':
        return mapped.sort((a, b) => b.toursCompleted - a.toursCompleted);
      case 'response_rate':
        // Guides with no bookings yet have no response rate; sort them last
        // rather than treating "unknown" as zero or as a fabricated 95%.
        return mapped.sort((a, b) => (b.responseRatePct ?? -1) - (a.responseRatePct ?? -1));
      case 'price_asc':
        return mapped.sort(byPrice);
      case 'price_desc':
        return mapped.sort((a, b) => byPrice(b, a));
      default:
        return mapped;
    }
  }

  /// Maps a TourType name onto the app's category keys (lowercase
  /// snake_case; see MotoTourPackage._categoryDisplayLabels).
  private categoryKey(tourTypeName: string): string {
    const n = tourTypeName.toLowerCase();
    if (n.includes('city')) return 'city';
    if (n.includes('wildlife') || n.includes('safari')) return 'wildlife_safari';
    if (n.includes('history') || n.includes('heritage')) return 'history_heritage';
    if (n.includes('nature') || n.includes('scenic')) return 'nature_scenic';
    if (n.includes('gastro') || n.includes('food')) return 'gastronomy';
    if (n.includes('culture')) return 'culture';
    if (n.includes('community')) return 'community';
    return 'adventure';
  }
}
