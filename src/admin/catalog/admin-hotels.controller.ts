import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { parseAdminSort } from '../../common/admin-sort';

/// Review queue for hotel applications submitted via POST /hotel/apply.
@ApiTags('Admin · Hotels')
@ApiBearerAuth('access-token')
@Controller('admin/hotels')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminHotelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List hotels, optionally filtered by verification status' })
  @ApiQuery({ name: 'isVerified', required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false, description: 'createdAt | name' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  list(
    @Query('isVerified') isVerified?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const where =
      isVerified === undefined
        ? undefined
        : { isVerified: isVerified === 'true' };
    return this.prisma.hotel.findMany({
      where,
      include: {
        manager: { select: { id: true, fullName: true, email: true, role: true } },
        _count: { select: { rooms: true, bookings: true } },
      },
      orderBy: parseAdminSort(sortBy, sortDir, ['createdAt', 'name'] as const, { createdAt: 'desc' }),
    });
  }

  @Post(':id/verify')
  @ApiOperation({
    summary: 'Verify a pending hotel application',
    description:
      "Marks the hotel isVerified and promotes the applicant's role to HOTEL_MANAGER, unlocking /hotel/* for them.",
  })
  async verify(@Param('id') id: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException(`Hotel '${id}' not found.`);
    if (hotel.isVerified) {
      throw new BadRequestException('This hotel is already verified.');
    }

    const [updatedHotel] = await this.prisma.$transaction([
      this.prisma.hotel.update({ where: { id }, data: { isVerified: true } }),
      this.prisma.user.update({
        where: { id: hotel.managerId },
        data: { role: UserRole.HOTEL_MANAGER },
      }),
    ]);
    return updatedHotel;
  }
}
