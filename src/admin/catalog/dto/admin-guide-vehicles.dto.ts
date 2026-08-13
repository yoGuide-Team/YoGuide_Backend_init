import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GuideVehicleBodyDto {
  @ApiProperty({ description: 'Guide profile id (UUID)' })
  @IsString()
  guideId!: string;

  @ApiProperty({ description: 'Vehicle id (UUID)' })
  @IsString()
  vehicleId!: string;
}
