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
import { BookingBodyDto, UpdateBookingDto } from './dto/admin-catalog-bookings.dto';

@ApiTags('Admin · Bookings')
@ApiBearerAuth('access-token')
@Controller('admin/bookings')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminCatalogBookingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List bookings' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user id (UUID)' })
  @ApiQuery({ name: 'guideId', required: false, description: 'Filter by guide profile id (UUID)' })
  list(@Query('userId') userId?: string, @Query('guideId') guideId?: string) {
    return this.prisma.booking.findMany({
      where: {
        userId: userId || undefined,
        guideId: guideId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        package: { select: { id: true, name: true } },
        vehicle: { select: { id: true, name: true } },
        guide: { include: { user: { select: { fullName: true } } } },
        payment: true,
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking by id' })
  async get(@Param('id') id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: true,
        package: true,
        vehicle: true,
        guide: { include: { user: true } },
        payment: true,
        walletEntries: true,
      },
    });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    return booking;
  }

  @Post()
  @ApiOperation({ summary: 'Create booking' })
  async create(@Body() dto: BookingBodyDto) {
    await this.ensureUser(dto.userId);
    await this.ensurePackage(dto.packageId);
    await this.ensureVehicle(dto.vehicleId);
    await this.ensureGuide(dto.guideId);

    return this.prisma.booking.create({
      data: {
        userId: dto.userId,
        packageId: dto.packageId,
        vehicleId: dto.vehicleId,
        guideId: dto.guideId,
        scheduleDate: new Date(dto.scheduleDate),
        pickupLocation: dto.pickupLocation,
        totalDue: dto.totalDue,
      },
      include: { payment: true },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update booking' })
  async update(@Param('id') id: string, @Body() dto: UpdateBookingDto) {
    await this.ensureExists(id);
    return this.prisma.booking.update({
      where: { id },
      data: {
        scheduleDate: dto.scheduleDate ? new Date(dto.scheduleDate) : undefined,
        pickupLocation: dto.pickupLocation,
        totalDue: dto.totalDue,
      },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete booking' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    const payment = await this.prisma.payment.findUnique({ where: { bookingId: id } });
    if (payment) {
      throw new BadRequestException('Delete the booking payment first.');
    }
    await this.prisma.walletTransaction.updateMany({
      where: { bookingId: id },
      data: { bookingId: null },
    });
    await this.prisma.booking.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(`Booking '${id}' not found.`);
    return booking;
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User '${userId}' not found.`);
  }

  private async ensurePackage(packageId: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException(`Package '${packageId}' not found.`);
  }

  private async ensureVehicle(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle '${vehicleId}' not found.`);
  }

  private async ensureGuide(guideId: string) {
    const guide = await this.prisma.guideProfile.findUnique({ where: { id: guideId } });
    if (!guide) throw new NotFoundException(`Guide profile '${guideId}' not found.`);
  }
}
