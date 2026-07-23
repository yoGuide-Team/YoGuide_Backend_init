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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class ApplyGuideDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) specialties?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(60) yearsExperience?: number;
  @IsOptional() @IsString() city?: string;
}

class CreateGuideDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsInt() @Min(0) hourlyRateCents?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) specialties?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(60) yearsExperience?: number;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsBoolean() isVerified?: boolean;
}

class UpdateGuideDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsInt() @Min(0) hourlyRateCents?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) specialties?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsInt() @Min(0) yearsExperience?: number;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
}

class UploadDocumentDto {
  @IsIn(['licence', 'id', 'rdb_certificate', 'other']) kind!: string;
  @IsString() url!: string;
}

class ReviewDocumentDto {
  @IsIn(['approved', 'rejected']) status!: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('Public · Guides')
@Controller('guides')
export class GuidesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse guides',
    description:
      'Discoverable guide marketplace. Filter by city, language, or specialty. Only verified + available guides surface by default.',
  })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'language', required: false })
  @ApiQuery({ name: 'specialty', required: false })
  @ApiQuery({ name: 'includeUnverified', required: false, description: 'Set true to include unverified guides.' })
  async list(
    @Query('city') city?: string,
    @Query('language') language?: string,
    @Query('specialty') specialty?: string,
    @Query('includeUnverified') includeUnverified?: string,
  ) {
    return this.prisma.guide.findMany({
      where: {
        isAvailable: true,
        isVerified: includeUnverified === 'true' ? undefined : true,
        // Case-insensitive — same fix as vendors.controller.ts's list():
        // frontend passes lowercase city ('musanze'), stored data is
        // capitalized ('Musanze').
        city: city ? { equals: city, mode: 'insensitive' } : undefined,
        languages: language ? { has: language } : undefined,
        specialties: specialty ? { has: specialty } : undefined,
      },
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    });
  }

  @Post('apply')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply to become a guide',
    description:
      "Creates an unverified Guide profile linked to the signed-in user's account (one per account). An admin must verify it (POST /admin/guides/:id/verify) before it's discoverable and before the guide dashboard becomes reachable — verifying also promotes the user's role to `tour`.",
  })
  async apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyGuideDto) {
    const existing = await this.prisma.guide.findUnique({ where: { userId: user.id } });
    if (existing) {
      throw new BadRequestException('You already have a guide application on file.');
    }
    return this.prisma.guide.create({
      data: {
        userId: user.id,
        fullName: dto.fullName,
        bio: dto.bio,
        specialties: dto.specialties ?? [],
        languages: dto.languages ?? [],
        yearsExperience: dto.yearsExperience ?? 0,
        city: dto.city,
        isVerified: false,
      },
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Signed-in user's own guide profile" })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const guide = await this.prisma.guide.findUnique({ where: { userId: user.id } });
    if (!guide) throw new NotFoundException('No guide application found for this account.');
    return guide;
  }

  @Get('me/bookings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Bookings assigned to the signed-in user's guide profile" })
  async myBookings(@CurrentUser() user: AuthenticatedUser) {
    const guide = await this.prisma.guide.findUnique({ where: { userId: user.id } });
    if (!guide) throw new NotFoundException('No guide application found for this account.');
    return this.prisma.booking.findMany({
      where: { guideId: guide.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, fullName: true } },
        place: { select: { name: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Guide profile' })
  async detail(@Param('id') id: string) {
    const guide = await this.prisma.guide.findUnique({ where: { id } });
    if (!guide) throw new NotFoundException(`Guide '${id}' not found.`);
    return guide;
  }

  @Get(':id/availability')
  @ApiOperation({
    summary: 'Guide availability calendar',
    description:
      'Stub: returns the next 14 days with the guide marked as available unless `isAvailable=false`. Real calendar integration ships in v0.6.',
  })
  async availability(@Param('id') id: string) {
    const guide = await this.prisma.guide.findUnique({ where: { id } });
    if (!guide) throw new NotFoundException(`Guide '${id}' not found.`);
    const days: Array<{ date: string; available: boolean }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        date: d.toISOString().slice(0, 10),
        available: guide.isAvailable && i % 7 !== 0, // weekends off in the stub
      });
    }
    return { guideId: guide.id, days };
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'Reviews for guide' })
  async reviews(@Param('id') id: string) {
    return this.prisma.review.findMany({
      where: { guideId: id, status: 'approved' },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@ApiTags('Admin · Guides')
@ApiBearerAuth('access-token')
@Controller('admin/guides')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminGuidesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('guides.read')
  @ApiOperation({ summary: 'List all guides (admin)' })
  list(@Query('verified') verified?: string) {
    return this.prisma.guide.findMany({
      where:
        verified === 'true'
          ? { isVerified: true }
          : verified === 'false'
            ? { isVerified: false }
            : undefined,
      orderBy: { createdAt: 'desc' },
      include: { documents: true },
    });
  }

  @Post()
  @RequirePermissions('guides.write')
  @ApiOperation({ summary: 'Onboard guide' })
  create(@Body() dto: CreateGuideDto) {
    return this.prisma.guide.create({
      data: {
        ...dto,
        specialties: dto.specialties ?? [],
        languages: dto.languages ?? [],
      },
    });
  }

  @Patch(':id')
  @RequirePermissions('guides.write')
  @ApiOperation({ summary: 'Update guide' })
  async update(@Param('id') id: string, @Body() dto: UpdateGuideDto) {
    const exists = await this.prisma.guide.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Guide '${id}' not found.`);
    return this.prisma.guide.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermissions('guides.write')
  @ApiOperation({ summary: 'Delete guide' })
  async remove(@Param('id') id: string) {
    const exists = await this.prisma.guide.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Guide '${id}' not found.`);
    await this.prisma.guide.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/verify')
  @RequirePermissions('guides.write')
  @ApiOperation({
    summary: 'Mark guide as verified',
    description:
      "If the guide is linked to a user account (self-applied via POST /guides/apply), also promotes that user's role to `tour` so /guide-dashboard becomes reachable for them.",
  })
  async verify(@Param('id') id: string) {
    const exists = await this.prisma.guide.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Guide '${id}' not found.`);
    const updated = await this.prisma.guide.update({
      where: { id },
      data: { isVerified: true },
    });
    if (exists.userId) {
      await this.prisma.user.update({
        where: { id: exists.userId },
        data: { roleKey: 'tour' },
      });
    }
    return updated;
  }

  @Post(':id/documents')
  @RequirePermissions('guides.write')
  @ApiOperation({ summary: 'Attach a document to a guide for review' })
  async addDoc(@Param('id') id: string, @Body() dto: UploadDocumentDto) {
    const guide = await this.prisma.guide.findUnique({ where: { id } });
    if (!guide) throw new NotFoundException(`Guide '${id}' not found.`);
    return this.prisma.guideDocument.create({
      data: { guideId: id, kind: dto.kind, url: dto.url },
    });
  }

  @Patch(':guideId/documents/:docId')
  @RequirePermissions('guides.write')
  @ApiOperation({ summary: 'Approve or reject a guide document' })
  async reviewDoc(
    @Param('guideId') guideId: string,
    @Param('docId') docId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    const doc = await this.prisma.guideDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.guideId !== guideId) {
      throw new NotFoundException('Document not found on that guide.');
    }
    return this.prisma.guideDocument.update({
      where: { id: docId },
      data: { status: dto.status, notes: dto.notes ?? null },
    });
  }
}
