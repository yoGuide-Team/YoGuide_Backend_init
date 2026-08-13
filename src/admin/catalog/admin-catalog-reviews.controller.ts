import {
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
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { ReviewBodyDto, UpdateReviewDto } from './dto/admin-catalog-reviews.dto';

@ApiTags('Admin · Reviews')
@ApiBearerAuth('access-token')
@Controller('admin/reviews')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminCatalogReviewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user id (UUID)' })
  @ApiQuery({ name: 'guideId', required: false, description: 'Filter by guide profile id (UUID)' })
  @ApiQuery({ name: 'packageId', required: false, description: 'Filter by package id (UUID)' })
  list(
    @Query('userId') userId?: string,
    @Query('guideId') guideId?: string,
    @Query('packageId') packageId?: string,
  ) {
    return this.prisma.review.findMany({
      where: {
        userId: userId || undefined,
        guideId: guideId || undefined,
        packageId: packageId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        guide: { select: { id: true, companyName: true, user: { select: { fullName: true } } } },
        package: { select: { id: true, name: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get review by id' })
  async get(@Param('id') id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { user: true, guide: true, package: true },
    });
    if (!review) throw new NotFoundException(`Review '${id}' not found.`);
    return review;
  }

  @Post()
  @ApiOperation({ summary: 'Create review' })
  async create(@Body() dto: ReviewBodyDto) {
    await this.ensureUser(dto.userId);
    if (dto.guideId) await this.ensureGuide(dto.guideId);
    if (dto.packageId) await this.ensurePackage(dto.packageId);
    return this.prisma.review.create({ data: dto });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update review' })
  async update(@Param('id') id: string, @Body() dto: UpdateReviewDto) {
    await this.ensureExists(id);
    return this.prisma.review.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete review' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    await this.prisma.review.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException(`Review '${id}' not found.`);
    return review;
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User '${userId}' not found.`);
  }

  private async ensureGuide(guideId: string) {
    const guide = await this.prisma.guideProfile.findUnique({ where: { id: guideId } });
    if (!guide) throw new NotFoundException(`Guide profile '${guideId}' not found.`);
  }

  private async ensurePackage(packageId: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException(`Package '${packageId}' not found.`);
  }
}
