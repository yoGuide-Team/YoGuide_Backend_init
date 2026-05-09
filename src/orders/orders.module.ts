import { Module } from '@nestjs/common';
import { AdminOrdersController, OrdersController } from './orders.controller';

@Module({ controllers: [OrdersController, AdminOrdersController] })
export class OrdersModule {}
