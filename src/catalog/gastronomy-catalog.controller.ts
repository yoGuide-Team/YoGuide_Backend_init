import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

const CHEF_LIST_INCLUDE = {
  category: true,
  guide: {
    include: {
      user: {
        select: { id: true, fullName: true, profileImage: true, phone: true, email: true },
      },
      experiences: {
        include: { media: { orderBy: { sortOrder: 'asc' as const } } },
        orderBy: { sortOrder: 'asc' as const },
      },
      _count: { select: { reviews: true, bookings: true } },
    },
  },
  courses: {
    orderBy: { sortOrder: 'asc' as const },
    include: { media: { orderBy: { sortOrder: 'asc' as const } } },
  },
  priceTiers: { orderBy: { minPartySize: 'asc' as const } },
};

/// Public, unauthenticated gastronomy browsing for the mobile/web apps —
/// mirrors CatalogController's convention (no guards, PrismaService
/// injected directly).
@ApiTags('Catalog · Gastronomy')
@Controller('catalog/gastronomy')
export class GastronomyCatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List active gastronomy categories' })
  listCategories() {
    return this.prisma.gastronomyCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Get('chefs')
  @ApiOperation({ summary: 'List chefs, optionally filtered by category' })
  @ApiQuery({ name: 'categoryId', required: false })
  async listChefs(@Query('categoryId') categoryId?: string) {
    const chefs = await this.prisma.chefProfile.findMany({
      where: categoryId ? { categoryId } : undefined,
      include: CHEF_LIST_INCLUDE,
    });
    return chefs.map((c) => this.toChefResponse(c));
  }

  @Get('chefs/:guideId')
  @ApiOperation({ summary: 'Get a chef by their guide id' })
  async getChef(@Param('guideId') guideId: string) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { guideId },
      include: CHEF_LIST_INCLUDE,
    });
    if (!chef) throw new NotFoundException(`No chef profile for guide '${guideId}'.`);
    return this.toChefResponse(chef);
  }

  /// Keyed by GuideProfile.id (not ChefProfile.id) — the frontend already
  /// treats guideId as the single id for a person across reviews,
  /// bookings, etc., so the chef-specific relational id stays internal.
  private toChefResponse(chef: {
    id: string;
    guideId: string;
    category: { id: string; name: string; description: string | null; iconKey: string | null };
    restaurantName: string | null;
    experienceName: string | null;
    area: string | null;
    tags: string[];
    introVideoUrl: string | null;
    storyTitle: string | null;
    storyDurationLabel: string | null;
    storyText: string | null;
    guide: {
      user: {
        id: string;
        fullName: string;
        profileImage: string | null;
        phone: string | null;
        email: string;
      };
      companyName: string | null;
      guideType: string;
      languages: string[];
      numberOfTours: number;
      experiences: {
        id: string;
        title: string;
        description: string | null;
        media: { id: string; url: string; type: string }[];
      }[];
      _count: { reviews: number; bookings: number };
    };
    courses: {
      id: string;
      name: string;
      description: string | null;
      imageUrl: string | null;
      media: { id: string; url: string; type: string }[];
    }[];
    priceTiers: { id: string; minPartySize: number; maxPartySize: number | null; pricePerPersonUsd: unknown }[];
  }) {
    return {
      id: chef.guideId,
      fullName: chef.guide.user.fullName,
      avatarUrl: chef.guide.user.profileImage,
      phone: chef.guide.user.phone,
      email: chef.guide.user.email,
      languages: chef.guide.languages,
      tourCompany: chef.guide.companyName,
      guideType: chef.guide.guideType,
      numberOfTours: chef.guide.numberOfTours,
      bio: chef.guide.companyName ? `Guide at ${chef.guide.companyName}` : '',
      chefCategoryId: chef.category.id,
      chefCategoryName: chef.category.name,
      restaurantName: chef.restaurantName,
      experienceName: chef.experienceName,
      gastronomyArea: chef.area,
      chefTags: chef.tags,
      introVideoUrl: chef.introVideoUrl,
      menuCourses: chef.courses.map((c) => ({
        id: c.id,
        course: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        media: c.media.map((m) => ({ id: m.id, url: m.url, type: m.type })),
      })),
      experiences: chef.guide.experiences.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        media: e.media.map((m) => ({ id: m.id, url: m.url, type: m.type })),
      })),
      priceTiers: chef.priceTiers.map((t) => ({
        minPartySize: t.minPartySize,
        maxPartySize: t.maxPartySize,
        pricePerPersonUsd: t.pricePerPersonUsd,
      })),
      story: chef.storyTitle
        ? { title: chef.storyTitle, durationLabel: chef.storyDurationLabel, text: chef.storyText }
        : null,
      reviewCount: chef.guide._count.reviews,
      toursCompleted: chef.guide._count.bookings,
    };
  }
}
