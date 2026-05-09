import { Module } from '@nestjs/common';
import { AdminEventsController, EventsController } from './events.controller';

@Module({ controllers: [EventsController, AdminEventsController] })
export class EventsModule {}
