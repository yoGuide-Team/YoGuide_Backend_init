import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { MediaType } from '@prisma/client';

export class GuideExperienceBodyDto {
  @ApiProperty({ example: 'Sunrise gorilla trek briefing', minLength: 2 })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateGuideExperienceDto {
  @ApiPropertyOptional({ minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class GuideExperienceMediaBodyDto {
  @ApiProperty({ example: 'https://cdn.example.com/experiences/trek-1.jpg' })
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
