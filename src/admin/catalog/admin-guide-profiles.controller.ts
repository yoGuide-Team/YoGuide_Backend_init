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
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { GuideProfileBodyDto, UpdateGuideProfileDto } from './dto/admin-guide-profiles.dto';

@ApiTags('Admin · Guide Profiles')
@ApiBearerAuth('access-token')
@Controller('admin/guide-profiles')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminGuideProfilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List guide profiles' })
  list() {
    return this.prisma.guideProfile.findMany({
      orderBy: { numberOfTours: 'desc' },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, phone: true, role: true },
        },
        vehicles: { include: { vehicle: true } },
        _count: { select: { bookings: true, reviews: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get guide profile by id' })
  async get(@Param('id') id: string) {
    const profile = await this.prisma.guideProfile.findUnique({
      where: { id },
      include: {
        user: true,
        vehicles: { include: { vehicle: true } },
        bookings: true,
        reviews: true,
      },
    });
    if (!profile) throw new NotFoundException(`Guide profile '${id}' not found.`);
    return profile;
  }

  @Post()
  @ApiOperation({ summary: 'Create guide profile' })
  async create(@Body() dto: GuideProfileBodyDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`User '${dto.userId}' not found.`);

    const existing = await this.prisma.guideProfile.findUnique({
      where: { userId: dto.userId },
    });
    if (existing) {
      throw new BadRequestException('This user already has a guide profile.');
    }

    return this.prisma.guideProfile.create({
      data: {
        userId: dto.userId,
        guideType: dto.guideType,
        companyName: dto.companyName,
        languages: dto.languages,
        numberOfTours: dto.numberOfTours ?? 0,
      },
      include: { user: true },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update guide profile' })
  async update(@Param('id') id: string, @Body() dto: UpdateGuideProfileDto) {
    await this.ensureExists(id);
    return this.prisma.guideProfile.update({
      where: { id },
      data: dto,
      include: { user: true },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete guide profile' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const bookingCount = await this.prisma.booking.count({ where: { guideId: id } });
    if (bookingCount > 0) {
      throw new BadRequestException('Cannot delete a guide profile with existing bookings.');
    }
    await this.prisma.guideVehicle.deleteMany({ where: { guideId: id } });
    await this.prisma.guideProfile.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const profile = await this.prisma.guideProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException(`Guide profile '${id}' not found.`);
    return profile;
  }
}
