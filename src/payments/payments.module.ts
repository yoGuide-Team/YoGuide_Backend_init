import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { CardsController } from './cards.controller';

@Module({
  controllers: [PaymentsController, CardsController],
})
export class PaymentsModule {}
