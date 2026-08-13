import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { MediaType } from '@prisma/client';

export class PackageBodyDto {
  @ApiProperty({ description: 'Tour type id (UUID)' })
  @IsString()
  tourTypeId!: string;

  @ApiProperty({ example: 'Gorilla Trekking Day Trip', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'Full-day guided trek in Volcanoes National Park.', minLength: 2 })
  @IsString()
  @MinLength(2)
  description!: string;

  @ApiProperty({ example: 8, minimum: 1, description: 'Total package duration in hours' })
  @IsInt()
  @Min(1)
  durationHours!: number;

  @ApiProperty({ example: 450.0, minimum: 0, description: 'Package price (decimal)' })
  @IsNumber()
  @Min(0)
  price!: number;
}

export class UpdatePackageDto {
  @ApiPropertyOptional({ minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationHours?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class PackageTourBodyDto {
  @ApiProperty({ example: 'Morning briefing' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: 'Meet your guide at the hotel lobby.' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty({ example: 2, minimum: 1, description: 'Tour segment duration in hours' })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({ example: 50.0, minimum: 0, description: 'Tour segment price (decimal)' })
  @IsNumber()
  @Min(0)
  price!: number;
}

export class PackageMediaBodyDto {
  @ApiProperty({ example: 'https://cdn.example.com/packages/gorilla.jpg' })
  @IsString()
  url!: string;

  @ApiProperty({ enum: MediaType, enumName: 'MediaType', example: MediaType.IMAGE })
  @IsEnum(MediaType)
  type!: MediaType;
}
