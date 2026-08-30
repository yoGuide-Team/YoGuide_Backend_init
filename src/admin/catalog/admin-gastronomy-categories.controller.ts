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
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { GastronomyCategoryBodyDto, UpdateGastronomyCategoryDto } from './dto/admin-gastronomy-categories.dto';
import { parseAdminSort } from '../../common/admin-sort';

@ApiTags('Admin · Gastronomy Categories')
@ApiBearerAuth('access-token')
@Controller('admin/gastronomy-categories')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminGastronomyCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List gastronomy categories' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'sortOrder | name' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  list(@Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.prisma.gastronomyCategory.findMany({
      orderBy: parseAdminSort(sortBy, sortDir, ['sortOrder', 'name'] as const, { sortOrder: 'asc' }),
      include: { _count: { select: { chefs: true } } },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get gastronomy category by id' })
  async get(@Param('id') id: string) {
    return this.ensureExists(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create gastronomy category' })
  create(@Body() dto: GastronomyCategoryBodyDto) {
    return this.prisma.gastronomyCategory.create({ data: dto });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update gastronomy category' })
  async update(@Param('id') id: string, @Body() dto: UpdateGastronomyCategoryDto) {
    await this.ensureExists(id);
    return this.prisma.gastronomyCategory.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete gastronomy category' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const childCount = await this.prisma.chefProfile.count({ where: { categoryId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Move or remove chefs under this category first.');
    }
    await this.prisma.gastronomyCategory.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const category = await this.prisma.gastronomyCategory.findUnique({
      where: { id },
      include: { _count: { select: { chefs: true } } },
    });
    if (!category) throw new NotFoundException(`Gastronomy category '${id}' not found.`);
    return category;
  }
}
