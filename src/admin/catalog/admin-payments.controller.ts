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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';

class PaymentBodyDto {
  @IsString()
  bookingId!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  transactionRef?: string;
}

class UpdatePaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  transactionRef?: string;
}

@ApiTags('Admin · Payments')
@ApiBearerAuth('access-token')
@Controller('admin/payments')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminPaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List payments' })
  list(@Query('status') status?: PaymentStatus, @Query('bookingId') bookingId?: string) {
    return this.prisma.payment.findMany({
      where: {
        status: status || undefined,
        bookingId: bookingId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
            package: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by id' })
  async get(@Param('id') id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { booking: { include: { user: true, package: true, guide: true, vehicle: true } } },
    });
    if (!payment) throw new NotFoundException(`Payment '${id}' not found.`);
    return payment;
  }

  @Post()
  @ApiOperation({ summary: 'Create payment for booking' })
  async create(@Body() dto: PaymentBodyDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
    if (!booking) throw new NotFoundException(`Booking '${dto.bookingId}' not found.`);

    const existing = await this.prisma.payment.findUnique({ where: { bookingId: dto.bookingId } });
    if (existing) {
      throw new BadRequestException('This booking already has a payment record.');
    }

    return this.prisma.payment.create({
      data: dto,
      include: { booking: true },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update payment' })
  async update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    await this.ensureExists(id);
    return this.prisma.payment.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete payment' })
  async remove(@Param('id') id: string) {
    await this.ensureExists(id);
    await this.prisma.payment.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment '${id}' not found.`);
    return payment;
  }
}
