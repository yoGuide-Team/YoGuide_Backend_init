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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class CreateReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() title?: string;
  @IsString() @MinLength(10) body!: string;
  @IsOptional() @IsString() placeId?: string;
  @IsOptional() @IsString() guideId?: string;
  @IsOptional() @IsString() tourId?: string;
  @IsOptional() @IsString() vendorId?: string;
}

class ModerateReviewDto {
  @IsIn(['approved', 'rejected']) status!: string;
}

@ApiTags('Reviews')
@ApiBearerAuth('access-token')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List approved reviews',
    description: 'Filter by placeId, guideId, or tourId. Only approved reviews are shown publicly.',
  })
  @ApiQuery({ name: 'placeId', required: false })
  @ApiQuery({ name: 'guideId', required: false })
  @ApiQuery({ name: 'tourId', required: false })
  @ApiQuery({ name: 'vendorId', required: false })
  list(
    @Query('placeId') placeId?: string,
    @Query('guideId') guideId?: string,
    @Query('tourId') tourId?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.prisma.review.findMany({
      where: {
        status: 'approved',
        placeId: placeId || undefined,
        guideId: guideId || undefined,
        tourId: tourId || undefined,
        vendorId: vendorId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Submit a review',
    description: 'Creates a review in `pending` status. An admin (or auto-moderation later) approves it before it surfaces publicly.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ) {
    if (!dto.placeId && !dto.guideId && !dto.tourId && !dto.vendorId) {
      throw new BadRequestException(
        'At least one of placeId, guideId, tourId, or vendorId must be provided.',
      );
    }
    return this.prisma.review.create({
      data: { ...dto, authorId: user.id },
    });
  }

  @Get('mine')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'My reviews (any status)' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.review.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Delete my review' })
  async deleteMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Review not found.');
    if (r.authorId !== user.id) {
      throw new ForbiddenException('That review belongs to someone else.');
    }
    await this.prisma.review.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags('Admin · Reviews')
@ApiBearerAuth('access-token')
@Controller('admin/reviews')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminReviewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('reviews.moderate')
  @ApiOperation({ summary: 'Moderation queue', description: 'Filter by status. Default: every review.' })
  list(@Query('status') status?: string) {
    return this.prisma.review.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Patch(':id/status')
  @RequirePermissions('reviews.moderate')
  @ApiOperation({ summary: 'Approve or reject a review' })
  async moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Review not found.');
    return this.prisma.review.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  @Delete(':id')
  @RequirePermissions('reviews.moderate')
  @ApiOperation({ summary: 'Hard-delete a review' })
  async remove(@Param('id') id: string) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Review not found.');
    await this.prisma.review.delete({ where: { id } });
    return { ok: true };
  }
}
