import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class GastronomyCategoryBodyDto {
  @ApiProperty({ example: 'Homestyle', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Home-cooked meals in a local family kitchen.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Frontend icon tag', example: 'ramen_dining' })
  @IsOptional()
  @IsString()
  iconKey?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateGastronomyCategoryDto {
  @ApiPropertyOptional({ example: 'Homestyle', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'Home-cooked meals in a local family kitchen.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Frontend icon tag', example: 'ramen_dining' })
  @IsOptional()
  @IsString()
  iconKey?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
