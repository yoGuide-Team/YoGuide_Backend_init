import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { GuideVehicleBodyDto } from './dto/admin-guide-vehicles.dto';

@ApiTags('Admin · Guide Vehicles')
@ApiBearerAuth('access-token')
@Controller('admin/guide-vehicles')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminGuideVehiclesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List guide-vehicle assignments' })
  @ApiQuery({ name: 'guideId', required: false, description: 'Filter by guide profile id (UUID)' })
  @ApiQuery({ name: 'vehicleId', required: false, description: 'Filter by vehicle id (UUID)' })
  list(@Query('guideId') guideId?: string, @Query('vehicleId') vehicleId?: string) {
    return this.prisma.guideVehicle.findMany({
      where: {
        guideId: guideId || undefined,
        vehicleId: vehicleId || undefined,
      },
      include: {
        guide: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        vehicle: true,
      },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Assign vehicle to guide' })
  async assign(@Body() dto: GuideVehicleBodyDto) {
    await this.ensureGuide(dto.guideId);
    await this.ensureVehicle(dto.vehicleId);

    const existing = await this.prisma.guideVehicle.findUnique({
      where: { guideId_vehicleId: { guideId: dto.guideId, vehicleId: dto.vehicleId } },
    });
    if (existing) {
      throw new BadRequestException('This guide is already assigned to that vehicle.');
    }

    return this.prisma.guideVehicle.create({
      data: dto,
      include: { guide: true, vehicle: true },
    });
  }

  @Delete(':guideId/:vehicleId')
  @ApiOperation({ summary: 'Remove vehicle from guide' })
  async unassign(@Param('guideId') guideId: string, @Param('vehicleId') vehicleId: string) {
    const link = await this.prisma.guideVehicle.findUnique({
      where: { guideId_vehicleId: { guideId, vehicleId } },
    });
    if (!link) {
      throw new NotFoundException('Guide-vehicle assignment not found.');
    }
    await this.prisma.guideVehicle.delete({
      where: { guideId_vehicleId: { guideId, vehicleId } },
    });
    return { ok: true };
  }

  private async ensureGuide(guideId: string) {
    const guide = await this.prisma.guideProfile.findUnique({ where: { id: guideId } });
    if (!guide) throw new NotFoundException(`Guide profile '${guideId}' not found.`);
  }

  private async ensureVehicle(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle '${vehicleId}' not found.`);
  }
}
