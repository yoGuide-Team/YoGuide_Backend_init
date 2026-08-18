import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { MediaType } from '@prisma/client';

export class UpsertChefProfileDto {
  @ApiProperty({ description: 'GastronomyCategory id (UUID)' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  experienceName?: string;

  @ApiPropertyOptional({ description: 'Neighborhood/area label' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Hosted video link (YouTube/Cloudinary/S3/etc.)' })
  @IsOptional()
  @IsString()
  introVideoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storyTitle?: string;

  @ApiPropertyOptional({ example: '2-3 hours' })
  @IsOptional()
  @IsString()
  storyDurationLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storyText?: string;
}

export class UpdateChefProfileDto {
  @ApiPropertyOptional({ description: 'GastronomyCategory id (UUID)' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  experienceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  introVideoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storyTitle?: string;

  @ApiPropertyOptional({ example: '2-3 hours' })
  @IsOptional()
  @IsString()
  storyDurationLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storyText?: string;
}

export class ChefCourseBodyDto {
  @ApiProperty({ example: 'Isombe with grilled plantain', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Hosted dish photo link' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateChefCourseDto {
  @ApiPropertyOptional({ minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Hosted dish photo link' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ChefPriceTierBodyDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  minPartySize!: number;

  @ApiPropertyOptional({ description: 'null means "and up"', example: 2, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPartySize?: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  pricePerPersonUsd!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateChefPriceTierDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minPartySize?: number;

  @ApiPropertyOptional({ description: 'null means "and up"', example: 2, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPartySize?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerPersonUsd?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ChefCourseMediaBodyDto {
  @ApiProperty({ example: 'https://cdn.example.com/courses/isombe-1.jpg' })
  @IsString()
  url!: string;

  @ApiProperty({ enum: MediaType, enumName: 'MediaType', example: MediaType.IMAGE })
  @IsEnum(MediaType)
  type!: MediaType;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
