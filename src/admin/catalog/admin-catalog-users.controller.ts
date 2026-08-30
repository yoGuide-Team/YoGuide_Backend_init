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
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { CreateUserDto, UpdateUserDto } from './dto/admin-catalog-users.dto';
import { parseAdminSort } from '../../common/admin-sort';

@ApiTags('Admin · Users')
@ApiBearerAuth('access-token')
@Controller('admin/users')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminCatalogUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole, enumName: 'UserRole' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'fullName | email | createdAt | updatedAt | role' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  list(
    @Query('role') role?: UserRole,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.prisma.user.findMany({
      where: role ? { role } : undefined,
      orderBy: parseAdminSort(
        sortBy,
        sortDir,
        ['fullName', 'email', 'createdAt', 'updatedAt', 'role'] as const,
        { createdAt: 'desc' },
      ),
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        nationality: true,
        role: true,
        visitorType: true,
        profileImage: true,
        emailVerified: true,
        defaultLanguage: true,
        currentRegionId: true,
        createdAt: true,
        updatedAt: true,
        guideProfile: { select: { id: true, guideType: true } },
        wallet: { select: { id: true, balanceCents: true, currency: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  async get(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        currentRegion: true,
        guideProfile: true,
        wallet: true,
        bookings: true,
        reviews: true,
      },
    });
    if (!user) throw new NotFoundException(`User '${id}' not found.`);
    const { password: _password, ...safe } = user;
    return safe;
  }

  @Post()
  @ApiOperation({ summary: 'Create user' })
  async create(@Body() dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Email already in use.');

    if (dto.currentRegionId) await this.ensureRegion(dto.currentRegionId);

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone?.trim(),
        password,
        nationality: dto.nationality.trim(),
        role: dto.role,
        visitorType: dto.visitorType,
        profileImage: dto.profileImage,
        emailVerified: true,
        arrivalDate: dto.arrivalDate ? new Date(dto.arrivalDate) : undefined,
        departureDate: dto.departureDate ? new Date(dto.departureDate) : undefined,
        defaultLanguage: dto.defaultLanguage,
        currentRegionId: dto.currentRegionId,
        inAppNotifications: dto.inAppNotifications,
        emailNotifications: dto.emailNotifications,
      },
    });
    const { password: _password, ...safe } = user;
    return safe;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    await this.ensureExists(id);

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (clash) throw new BadRequestException('Email already in use.');
    }
    if (dto.currentRegionId) await this.ensureRegion(dto.currentRegionId);

    const data: Record<string, unknown> = { ...dto };
    if (dto.email) data.email = dto.email.trim().toLowerCase();
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);
    if (dto.arrivalDate) data.arrivalDate = new Date(dto.arrivalDate);
    if (dto.departureDate) data.departureDate = new Date(dto.departureDate);

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    const { password: _password, ...safe } = user;
    return safe;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const bookingCount = await this.prisma.booking.count({ where: { userId: id } });
    if (bookingCount > 0) {
      throw new BadRequestException('Cannot delete a user with existing bookings.');
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User '${id}' not found.`);
    return user;
  }

  private async ensureRegion(regionId: string) {
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException(`Region '${regionId}' not found.`);
  }
}
