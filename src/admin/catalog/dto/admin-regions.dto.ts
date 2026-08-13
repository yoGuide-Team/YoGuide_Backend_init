import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RegionBodyDto {
  @ApiProperty({ example: 'Northern Province', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;
}
