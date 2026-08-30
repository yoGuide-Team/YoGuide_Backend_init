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
import { TourTypeBodyDto, UpdateTourTypeDto } from './dto/admin-tour-types.dto';
import { parseAdminSort } from '../../common/admin-sort';

@ApiTags('Admin · Tour Types')
@ApiBearerAuth('access-token')
@Controller('admin/tour-types')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminTourTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List tour types' })
  @ApiQuery({ name: 'regionId', required: false, description: 'Filter by region id (UUID)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'name' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  list(
    @Query('regionId') regionId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.prisma.tourType.findMany({
      where: regionId ? { regionId } : undefined,
      orderBy: parseAdminSort(sortBy, sortDir, ['name'] as const, { name: 'asc' }),
      include: {
        region: { select: { id: true, name: true } },
        _count: { select: { packages: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tour type by id' })
  async get(@Param('id') id: string) {
    const tourType = await this.prisma.tourType.findUnique({
      where: { id },
      include: { region: true, packages: true },
    });
    if (!tourType) throw new NotFoundException(`Tour type '${id}' not found.`);
    return tourType;
  }

  @Post()
  @ApiOperation({ summary: 'Create tour type' })
  async create(@Body() dto: TourTypeBodyDto) {
    await this.ensureRegion(dto.regionId);
    return this.prisma.tourType.create({ data: dto });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tour type' })
  async update(@Param('id') id: string, @Body() dto: UpdateTourTypeDto) {
    await this.ensureExists(id);
    return this.prisma.tourType.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tour type' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const childCount = await this.prisma.package.count({ where: { tourTypeId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Remove packages under this tour type first.');
    }
    await this.prisma.tourType.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureRegion(regionId: string) {
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException(`Region '${regionId}' not found.`);
  }

  private async ensureExists(id: string) {
    const tourType = await this.prisma.tourType.findUnique({ where: { id } });
    if (!tourType) throw new NotFoundException(`Tour type '${id}' not found.`);
    return tourType;
  }
}
