import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { CardsController } from './cards.controller';
import { BookingPaymentsController } from './booking-payments.controller';
import { YoEcoPayClient } from './yoecopay.client';
import { BookingPaymentsService } from './booking-payments.service';
import { RefundService } from './refund.service';
import { PayoutService } from './payout.service';
import {
  AdminPayoutsController,
  GuidePayoutsController,
  PublicPayoutsController,
} from './payouts.controller';

@Module({
  imports: [ConfigModule],
  controllers: [
    PaymentsController,
    CardsController,
    BookingPaymentsController,
    PublicPayoutsController,
    GuidePayoutsController,
    AdminPayoutsController,
  ],
  providers: [YoEcoPayClient, BookingPaymentsService, RefundService, PayoutService],
  exports: [BookingPaymentsService, RefundService, PayoutService, YoEcoPayClient],
})
export class PaymentsModule {}
