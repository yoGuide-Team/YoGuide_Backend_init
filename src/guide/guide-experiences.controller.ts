import {
  Body,
  Controller,
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
  GuideExperienceBodyDto,
  GuideExperienceMediaBodyDto,
  UpdateGuideExperienceDto,
} from './dto/guide-experience.dto';

/// Self-service "Experience" showcase — available to ANY guide (chef or
/// not), unlike ChefCourse which is chef-scoped and booking-load-bearing.
/// Purely a marketing/trust gallery: title + description + media, no
/// booking linkage. Ownership always resolves through the caller's own
/// GuideProfile, mirroring GuideGastronomyController's pattern.
@ApiTags('Guide · Experiences')
@ApiBearerAuth('access-token')
@Controller('guide/experiences')
@UseGuards(AuthGuard, GuideRoleGuard)
export class GuideExperiencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List my experiences' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const guide = await this.requireGuideProfile(user);
    return this.prisma.guideExperience.findMany({
      where: { guideId: guide.id },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Add an experience' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: GuideExperienceBodyDto) {
    const guide = await this.requireGuideProfile(user);
    return this.prisma.guideExperience.create({ data: { guideId: guide.id, ...dto } });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an experience' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGuideExperienceDto,
  ) {
    const guide = await this.requireGuideProfile(user);
    await this.ensureOwn(guide.id, id);
    return this.prisma.guideExperience.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove an experience' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const guide = await this.requireGuideProfile(user);
    await this.ensureOwn(guide.id, id);
    await this.prisma.guideExperience.delete({ where: { id } });
    return { ok: true };
  }

  // ── Media ──────────────────────────────────────────────────

  @Get(':experienceId/media')
  @ApiOperation({ summary: "List an experience's media" })
  async listMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('experienceId') experienceId: string,
  ) {
    const guide = await this.requireGuideProfile(user);
    await this.ensureOwn(guide.id, experienceId);
    return this.prisma.guideExperienceMedia.findMany({
      where: { experienceId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post(':experienceId/media')
  @ApiOperation({ summary: 'Add experience media' })
  async addMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('experienceId') experienceId: string,
    @Body() dto: GuideExperienceMediaBodyDto,
  ) {
    const guide = await this.requireGuideProfile(user);
    await this.ensureOwn(guide.id, experienceId);
    return this.prisma.guideExperienceMedia.create({ data: { experienceId, ...dto } });
  }

  @Delete(':experienceId/media/:mediaId')
  @ApiOperation({ summary: 'Remove experience media' })
  async removeMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('experienceId') experienceId: string,
    @Param('mediaId') mediaId: string,
  ) {
    const guide = await this.requireGuideProfile(user);
    await this.ensureOwn(guide.id, experienceId);
    await this.ensureOwnMedia(experienceId, mediaId);
    await this.prisma.guideExperienceMedia.delete({ where: { id: mediaId } });
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

  private async ensureOwn(guideId: string, experienceId: string) {
    const exp = await this.prisma.guideExperience.findUnique({ where: { id: experienceId } });
    if (!exp || exp.guideId !== guideId) {
      throw new NotFoundException(`Experience '${experienceId}' not found.`);
    }
    return exp;
  }

  private async ensureOwnMedia(experienceId: string, mediaId: string) {
    const media = await this.prisma.guideExperienceMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.experienceId !== experienceId) {
      throw new NotFoundException(`Media '${mediaId}' not found on this experience.`);
    }
    return media;
  }
}
