import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class TourTypeBodyDto {
  @ApiProperty({ description: 'Region id (UUID)' })
  @IsString()
  regionId!: string;

  @ApiProperty({ example: 'Wildlife Safari', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;
}

export class UpdateTourTypeDto {
  @ApiPropertyOptional({ example: 'Wildlife Safari', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
