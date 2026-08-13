import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class VehicleBodyDto {
  @ApiProperty({ example: 'Toyota Land Cruiser', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'suv' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ example: 7, minimum: 1 })
  @IsInt()
  @Min(1)
  seats!: number;

  @ApiProperty({ example: 25.0, minimum: 0, description: 'Hourly rate (decimal)' })
  @IsNumber()
  @Min(0)
  pricePerHour!: number;

  @ApiProperty({ example: 150.0, minimum: 0, description: 'Daily rate (decimal)' })
  @IsNumber()
  @Min(0)
  pricePerDay!: number;
}
