import { Module } from '@nestjs/common';
import { HotelController } from './hotel.controller';
import { HotelPublicController } from './hotel-public.controller';
import { HotelApplyController } from './hotel-apply.controller';
import { HotelRoleGuard } from './hotel-role.guard';

@Module({
  controllers: [HotelController, HotelPublicController, HotelApplyController],
  providers: [HotelRoleGuard],
})
export class HotelModule {}
