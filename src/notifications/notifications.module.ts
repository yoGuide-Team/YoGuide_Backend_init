import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/// Global so any module can emit a notification on a real event without
/// each one having to import this module. Until NotificationsService
/// existed nothing wrote to the Notification table at all.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
