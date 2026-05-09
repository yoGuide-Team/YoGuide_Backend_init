import { Module } from '@nestjs/common';
import { AdminToursController, ToursController } from './tours.controller';

@Module({ controllers: [ToursController, AdminToursController] })
export class ToursModule {}
