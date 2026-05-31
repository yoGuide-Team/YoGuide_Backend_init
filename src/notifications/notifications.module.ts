import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
 
@Module({
  controllers: [NotificationsController],
  providers:   [NotificationsService],
  exports:     [NotificationsService],   // ← so WalletModule, OnboardingModule can inject it
})
export class NotificationsModule {}
 