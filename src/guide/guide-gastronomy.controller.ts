import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GuideRoleGuard } from './guide-role.guard';
import {
  ChefCourseBodyDto,
  ChefCourseMediaBodyDto,
  ChefPriceTierBodyDto,
  UpdateChefCourseDto,
  UpdateChefPriceTierDto,
  UpdateChefProfileDto,
  UpsertChefProfileDto,
} from './dto/guide-gastronomy.dto';

/// Self-service endpoints for a guide managing their own ChefProfile —
/// everything resolves through the authenticated user's own GuideProfile,
/// never a client-supplied id. Mirrors GuideController's self-service
/// pattern (see guide.controller.ts).
@ApiTags('Guide · Gastronomy self-service')
@ApiBearerAuth('access-token')
@Controller('guide/gastronomy')
@UseGuards(AuthGuard, GuideRoleGuard)
export class GuideGastronomyController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Chef profile ───────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get my chef profile' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const chef = await this.requireChefProfile(user);
    return this.prisma.chefProfile.findUnique({
      where: { id: chef.id },
      include: { category: true, courses: true, priceTiers: { orderBy: { minPartySize: 'asc' } } },
    });
  }

  @Post('profile')
  @ApiOperation({ summary: 'Create my chef profile' })
  async createProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertChefProfileDto) {
    const guideProfile = await this.requireGuideProfile(user);
    const existing = await this.prisma.chefProfile.findUnique({
      where: { guideId: guideProfile.id },
    });
    if (existing) throw new ConflictException('Chef profile already exists — use PATCH to update.');
    await this.ensureCategory(dto.categoryId);
    return this.prisma.chefProfile.create({
      data: { guideId: guideProfile.id, ...dto },
      include: { category: true },
    });
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update my chef profile' })
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateChefProfileDto) {
    const chef = await this.requireChefProfile(user);
    if (dto.categoryId) await this.ensureCategory(dto.categoryId);
    return this.prisma.chefProfile.update({
      where: { id: chef.id },
      data: dto,
      include: { category: true },
    });
  }

  // ── Courses ────────────────────────────────────────────────

  @Get('courses')
  @ApiOperation({ summary: 'List my menu courses' })
  async listCourses(@CurrentUser() user: AuthenticatedUser) {
    const chef = await this.requireChefProfile(user);
    return this.prisma.chefCourse.findMany({
      where: { chefId: chef.id },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post('courses')
  @ApiOperation({ summary: 'Add a menu course' })
  async createCourse(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChefCourseBodyDto) {
    const chef = await this.requireChefProfile(user);
    return this.prisma.chefCourse.create({ data: { chefId: chef.id, ...dto } });
  }

  @Patch('courses/:id')
  @ApiOperation({ summary: 'Update a menu course' })
  async updateCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateChefCourseDto,
  ) {
    const chef = await this.requireChefProfile(user);
    await this.ensureOwnCourse(chef.id, id);
    return this.prisma.chefCourse.update({ where: { id }, data: dto });
  }

  @Delete('courses/:id')
  @ApiOperation({ summary: 'Remove a menu course' })
  async removeCourse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const chef = await this.requireChefProfile(user);
    await this.ensureOwnCourse(chef.id, id);
    await this.prisma.chefCourse.delete({ where: { id } });
    return { ok: true };
  }

  // ── Course media ───────────────────────────────────────────

  @Get('courses/:courseId/media')
  @ApiOperation({ summary: "List a course's media" })
  async listCourseMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ) {
    const chef = await this.requireChefProfile(user);
    await this.ensureOwnCourse(chef.id, courseId);
    return this.prisma.chefCourseMedia.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post('courses/:courseId/media')
  @ApiOperation({ summary: 'Add course media' })
  async addCourseMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: ChefCourseMediaBodyDto,
  ) {
    const chef = await this.requireChefProfile(user);
    await this.ensureOwnCourse(chef.id, courseId);
    return this.prisma.chefCourseMedia.create({ data: { courseId, ...dto } });
  }

  @Delete('courses/:courseId/media/:mediaId')
  @ApiOperation({ summary: 'Remove course media' })
  async removeCourseMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('mediaId') mediaId: string,
  ) {
    const chef = await this.requireChefProfile(user);
    await this.ensureOwnCourse(chef.id, courseId);
    await this.ensureOwnCourseMedia(courseId, mediaId);
    await this.prisma.chefCourseMedia.delete({ where: { id: mediaId } });
    return { ok: true };
  }

  // ── Price tiers ────────────────────────────────────────────

  @Get('price-tiers')
  @ApiOperation({ summary: 'List my party-size price tiers' })
  async listPriceTiers(@CurrentUser() user: AuthenticatedUser) {
    const chef = await this.requireChefProfile(user);
    return this.prisma.chefPriceTier.findMany({
      where: { chefId: chef.id },
      orderBy: { minPartySize: 'asc' },
    });
  }

  @Post('price-tiers')
  @ApiOperation({ summary: 'Add a party-size price tier' })
  async createPriceTier(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChefPriceTierBodyDto) {
    const chef = await this.requireChefProfile(user);
    this.validateTierRange(dto.minPartySize, dto.maxPartySize);
    const siblings = await this.prisma.chefPriceTier.findMany({ where: { chefId: chef.id } });
    this.ensureNoOverlap(siblings, dto.minPartySize, dto.maxPartySize);
    return this.prisma.chefPriceTier.create({ data: { chefId: chef.id, ...dto } });
  }

  @Patch('price-tiers/:id')
  @ApiOperation({ summary: 'Update a party-size price tier' })
  async updatePriceTier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateChefPriceTierDto,
  ) {
    const chef = await this.requireChefProfile(user);
    const tier = await this.ensureOwnTier(chef.id, id);
    const minPartySize = dto.minPartySize ?? tier.minPartySize;
    const maxPartySize = dto.maxPartySize ?? tier.maxPartySize ?? undefined;
    this.validateTierRange(minPartySize, maxPartySize);
    const siblings = await this.prisma.chefPriceTier.findMany({
      where: { chefId: chef.id, id: { not: id } },
    });
    this.ensureNoOverlap(siblings, minPartySize, maxPartySize);
    return this.prisma.chefPriceTier.update({ where: { id }, data: dto });
  }

  @Delete('price-tiers/:id')
  @ApiOperation({ summary: 'Remove a party-size price tier' })
  async removePriceTier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const chef = await this.requireChefProfile(user);
    await this.ensureOwnTier(chef.id, id);
    await this.prisma.chefPriceTier.delete({ where: { id } });
    return { ok: true };
  }

  // ── Helpers ────────────────────────────────────────────────

  private async requireGuideProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.guideProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      throw new NotFoundException('No guide profile yet. Create one with POST /guide/profile.');
    }
    return profile;
  }

  private async requireChefProfile(user: AuthenticatedUser) {
    const guideProfile = await this.requireGuideProfile(user);
    const chef = await this.prisma.chefProfile.findUnique({ where: { guideId: guideProfile.id } });
    if (!chef) {
      throw new NotFoundException('No chef profile yet. Create one with POST /guide/gastronomy/profile.');
    }
    return chef;
  }

  private async ensureCategory(categoryId: string) {
    const category = await this.prisma.gastronomyCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Gastronomy category '${categoryId}' not found.`);
    if (!category.isActive) throw new BadRequestException('This category is not active.');
    return category;
  }

  private async ensureOwnCourse(chefId: string, courseId: string) {
    const course = await this.prisma.chefCourse.findUnique({ where: { id: courseId } });
    if (!course || course.chefId !== chefId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }
    return course;
  }

  private async ensureOwnCourseMedia(courseId: string, mediaId: string) {
    const media = await this.prisma.chefCourseMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.courseId !== courseId) {
      throw new NotFoundException(`Media '${mediaId}' not found on this course.`);
    }
    return media;
  }

  private async ensureOwnTier(chefId: string, tierId: string) {
    const tier = await this.prisma.chefPriceTier.findUnique({ where: { id: tierId } });
    if (!tier || tier.chefId !== chefId) {
      throw new NotFoundException(`Price tier '${tierId}' not found.`);
    }
    return tier;
  }

  private validateTierRange(minPartySize: number, maxPartySize?: number) {
    if (maxPartySize != null && maxPartySize < minPartySize) {
      throw new BadRequestException('maxPartySize must be >= minPartySize.');
    }
  }

  /// App-level overlap check (no DB constraint) — two brackets [a1,b1] and
  /// [a2,b2] overlap iff a1 <= b2 && a2 <= b1, treating a null max as
  /// unbounded ("and up").
  private ensureNoOverlap(
    siblings: { minPartySize: number; maxPartySize: number | null }[],
    minPartySize: number,
    maxPartySize?: number,
  ) {
    const b1 = maxPartySize ?? Infinity;
    for (const s of siblings) {
      const b2 = s.maxPartySize ?? Infinity;
      if (minPartySize <= b2 && s.minPartySize <= b1) {
        throw new BadRequestException(
          `This bracket overlaps an existing tier (${s.minPartySize}-${s.maxPartySize ?? '+'}).`,
        );
      }
    }
  }
}
