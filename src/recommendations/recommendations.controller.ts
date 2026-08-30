import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/// Rule-based recommendations over real data — no ML model. "Popular" =
/// highest real booking count; "top rated" = highest real average review
/// score (minimum 1 review, so an unreviewed item can't rank #1 on a
/// fabricated perfect score). Public — the web/Flutter home screens show
/// this to anonymous browsers too.
@ApiTags('Recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Home-screen recommendations' })
  @ApiQuery({ name: 'regionId', required: false, description: 'Bias results toward this region' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per section (default 6)' })
  async get(@Query('regionId') regionId?: string, @Query('limit') limitRaw?: string) {
    const limit = Math.min(20, Math.max(1, Number(limitRaw) || 6));

    const [popularPackages, newestPackages, topRatedGuides, ratedPackages] = await Promise.all([
      this.prisma.package.findMany({
        where: { isCustom: false, tourType: regionId ? { regionId } : undefined },
        orderBy: { bookings: { _count: 'desc' } },
        include: { media: true, _count: { select: { bookings: true, reviews: true } } },
        take: limit,
      }),
      this.prisma.package.findMany({
        where: { isCustom: false, tourType: regionId ? { regionId } : undefined },
        orderBy: { createdAt: 'desc' },
        include: { media: true, _count: { select: { bookings: true, reviews: true } } },
        take: limit,
      }),
      this.prisma.guideProfile.findMany({
        include: {
          user: { select: { fullName: true, profileImage: true } },
          reviews: { select: { starRating: true } },
          _count: { select: { bookings: true, reviews: true } },
        },
      }),
      this.prisma.package.findMany({
        where: { isCustom: false, tourType: regionId ? { regionId } : undefined },
        include: { media: true, reviews: { select: { starRating: true } }, _count: { select: { bookings: true, reviews: true } } },
      }),
    ]);

    const guidesWithRating = topRatedGuides
      .map((g) => {
        const ratings = g.reviews.map((r) => r.starRating);
        return {
          id: g.id,
          fullName: g.user.fullName,
          avatarUrl: g.user.profileImage,
          rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
          reviewCount: ratings.length,
          toursCompleted: g._count.bookings,
        };
      })
      .filter((g) => g.reviewCount >= 1)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);

    const topRatedPackages = ratedPackages
      .map((p) => {
        const ratings = p.reviews.map((r) => r.starRating);
        return {
          id: p.id,
          name: p.name,
          price: p.price,
          coverImage: p.media.find((m) => m.type === 'IMAGE')?.url ?? null,
          rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
          reviewCount: ratings.length,
        };
      })
      .filter((p) => p.reviewCount >= 1)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);

    return {
      popularPackages: popularPackages.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        coverImage: p.media.find((m) => m.type === 'IMAGE')?.url ?? null,
        bookingCount: p._count.bookings,
      })),
      newestPackages: newestPackages.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        coverImage: p.media.find((m) => m.type === 'IMAGE')?.url ?? null,
      })),
      topRatedGuides: guidesWithRating,
      topRatedPackages,
    };
  }
}
