import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { BookingStatus } from '@prisma/client';

export class BookingBodyDto {
  @ApiProperty({ description: 'User id (UUID)' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: 'Package id (UUID)' })
  @IsString()
  packageId!: string;

  @ApiProperty({ description: 'Vehicle id (UUID)' })
  @IsString()
  vehicleId!: string;

  @ApiProperty({ description: 'Guide profile id (UUID)' })
  @IsString()
  guideId!: string;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z', format: 'date-time' })
  @IsDateString()
  scheduleDate!: string;

  @ApiProperty({ example: 'Kigali Marriott Hotel', minLength: 2 })
  @IsString()
  @MinLength(2)
  pickupLocation!: string;

  @ApiProperty({ example: 520.0, minimum: 0 })
  @IsNumber()
  @Min(0)
  totalDue!: number;
}

export class UpdateBookingDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  scheduleDate?: string;

  @ApiPropertyOptional({ minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  pickupLocation?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalDue?: number;

  @ApiPropertyOptional({ enum: BookingStatus, enumName: 'BookingStatus' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
