import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class TripRegionSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Kigali' })
  name!: string;
}

export class TripResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  regionId?: string | null;

  @ApiPropertyOptional({ type: TripRegionSummary, nullable: true })
  region?: TripRegionSummary | null;

  @ApiPropertyOptional({ example: 'Summer holiday' })
  label?: string | null;

  @ApiProperty({ format: 'date-time' })
  arrivalDate!: Date;

  @ApiProperty({ format: 'date-time' })
  departureDate!: Date;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class CreateTripDto {
  @ApiPropertyOptional({ description: 'Region id (UUID) for where this trip is.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ example: 'Work conference', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  label?: string;

  @ApiProperty({ format: 'date-time', example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  arrivalDate!: string;

  @ApiProperty({ format: 'date-time', example: '2026-06-10T00:00:00.000Z' })
  @IsDateString()
  departureDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTripDto {
  @ApiPropertyOptional({ description: 'Region id (UUID).' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ example: 'Work conference', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  label?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  arrivalDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  departureDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
