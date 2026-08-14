import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  async listGuides() {
    const guides = await this.prisma.guideProfile.findMany({
      include: {
        user: { select: { fullName: true, profileImage: true } },
        reviews: { select: { starRating: true } },
        _count: { select: { bookings: true } },
      },
    });
    return guides.map((g) => {
      const ratings = g.reviews.map((r) => r.starRating);
      const rating = ratings.length
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;
      // Chef extras live in GuideProfile.gastronomy (JSON). The app's
      // gastronomy flow filters on specialties containing '#Food' and
      // reads the chef fields directly off the guide row.
      const gastro = (g.gastronomy ?? null) as {
        restaurantName?: string;
        gastronomyCategory?: string;
        experienceName?: string;
        gastronomyArea?: string;
        chefTags?: string[];
        perGuestUsd?: number;
        menuCourses?: Array<{ course: string; description: string }>;
        story?: { title: string; durationLabel: string; text: string };
      } | null;
      return {
        id: g.id,
        userId: g.userId,
        fullName: g.user.fullName,
        emoji: gastro ? '👨‍🍳' : '🧭',
        avatarUrl: g.user.profileImage,
        city: 'kigali',
        rating: Math.round(rating * 10) / 10,
        reviewCount: ratings.length,
        toursCompleted: g._count.bookings,
        responseRatePct: 95,
        specialties: gastro ? ['#Food'] : [],
        languages: g.languages,
        bio: g.companyName ? `Guide at ${g.companyName}` : '',
        hourlyRateCents: gastro?.perGuestUsd ? Math.round(gastro.perGuestUsd * 100) : null,
        currency: 'USD',
        isVerified: true,
        isAvailable: true,
        ...(gastro
          ? {
              restaurantName: gastro.restaurantName,
              gastronomyCategory: gastro.gastronomyCategory,
              experienceName: gastro.experienceName,
              gastronomyArea: gastro.gastronomyArea,
              chefTags: gastro.chefTags ?? [],
              menuCourses: gastro.menuCourses ?? [],
              story: gastro.story,
            }
          : {}),
      };
    });
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
