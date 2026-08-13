import { Module } from '@nestjs/common';
import { CustomPackagesController } from './custom-packages.controller';
import { BookingsController } from './bookings.controller';

@Module({
  controllers: [CustomPackagesController, BookingsController],
})
export class BookingModule {}
