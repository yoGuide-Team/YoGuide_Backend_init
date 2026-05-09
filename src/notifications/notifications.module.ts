import { Module } from '@nestjs/common';
import {
  AdminNotificationsController,
  NotificationsController,
} from './notifications.controller';

@Module({
  controllers: [NotificationsController, AdminNotificationsController],
})
export class NotificationsModule {}
