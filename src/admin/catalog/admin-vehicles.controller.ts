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
import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';

class VehicleBodyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsInt()
  @Min(1)
  seats!: number;

  @IsNumber()
  @Min(0)
  pricePerHour!: number;

  @IsNumber()
  @Min(0)
  pricePerDay!: number;
}

@ApiTags('Admin · Vehicles')
@ApiBearerAuth('access-token')
@Controller('admin/vehicles')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminVehiclesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List vehicles' })
  list() {
    return this.prisma.vehicle.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { guides: true, bookings: true } } },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vehicle by id' })
  async get(@Param('id') id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { guides: { include: { guide: { include: { user: true } } } } },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle '${id}' not found.`);
    return vehicle;
  }

  @Post()
  @ApiOperation({ summary: 'Create vehicle' })
  create(@Body() dto: VehicleBodyDto) {
    return this.prisma.vehicle.create({ data: dto });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vehicle' })
  async update(@Param('id') id: string, @Body() dto: Partial<VehicleBodyDto>) {
    await this.ensureExists(id);
    return this.prisma.vehicle.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete vehicle' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const bookingCount = await this.prisma.booking.count({ where: { vehicleId: id } });
    if (bookingCount > 0) {
      throw new BadRequestException('Cannot delete a vehicle with existing bookings.');
    }
    await this.prisma.guideVehicle.deleteMany({ where: { vehicleId: id } });
    await this.prisma.vehicle.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException(`Vehicle '${id}' not found.`);
    return vehicle;
  }
}
