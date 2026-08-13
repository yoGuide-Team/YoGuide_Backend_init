import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class PaymentBodyDto {
  @ApiProperty({ description: 'Booking id (UUID)' })
  @IsString()
  bookingId!: string;

  @ApiProperty({ example: 450.0, minimum: 0 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus', example: PaymentStatus.PENDING })
  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod', example: PaymentMethod.CARD })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ example: 'FLW-tx-123456' })
  @IsOptional()
  @IsString()
  transactionRef?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionRef?: string;
}
