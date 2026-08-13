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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';

class RegionBodyDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

@ApiTags('Admin · Regions')
@ApiBearerAuth('access-token')
@Controller('admin/regions')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminRegionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all regions' })
  list() {
    return this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { tourTypes: true, users: true } } },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get region by id' })
  async get(@Param('id') id: string) {
    const region = await this.prisma.region.findUnique({
      where: { id },
      include: { tourTypes: true },
    });
    if (!region) throw new NotFoundException(`Region '${id}' not found.`);
    return region;
  }

  @Post()
  @ApiOperation({ summary: 'Create region' })
  create(@Body() dto: RegionBodyDto) {
    return this.prisma.region.create({ data: dto });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update region' })
  async update(@Param('id') id: string, @Body() dto: RegionBodyDto) {
    await this.ensureExists(id);
    return this.prisma.region.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete region' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const childCount = await this.prisma.tourType.count({ where: { regionId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Remove tour types under this region first.');
    }
    await this.prisma.region.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException(`Region '${id}' not found.`);
    return region;
  }
}
