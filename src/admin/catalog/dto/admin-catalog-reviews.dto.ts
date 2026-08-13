import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReviewBodyDto {
  @ApiProperty({ description: 'User id (UUID)' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Guide profile id (UUID)' })
  @IsOptional()
  @IsString()
  guideId?: string;

  @ApiPropertyOptional({ description: 'Package id (UUID)' })
  @IsOptional()
  @IsString()
  packageId?: string;

  @ApiPropertyOptional({ example: 'Amazing experience, highly recommend!' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  starRating!: number;
}

export class UpdateReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  starRating?: number;
}
