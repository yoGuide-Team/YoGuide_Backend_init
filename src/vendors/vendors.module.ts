import { Module } from '@nestjs/common';
import { AdminVendorsController, VendorsController } from './vendors.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [VendorsController, AdminVendorsController],
})
export class VendorsModule {}
