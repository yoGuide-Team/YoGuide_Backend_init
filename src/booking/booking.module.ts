import { Module } from '@nestjs/common';
import { CustomPackagesController } from './custom-packages.controller';
import { BookingsController } from './bookings.controller';
import { AvailabilityModule } from '../availability/availability.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [AvailabilityModule, PaymentsModule],
  controllers: [CustomPackagesController, BookingsController],
})
export class BookingModule {}
