import { Module } from '@nestjs/common';
import { EsimOrdersController } from './esim-orders.controller';

@Module({
  controllers: [EsimOrdersController],
})
export class EsimModule {}
