import { Module } from '@nestjs/common';
import { AdminGuideCompaniesController, GuideCompaniesController } from './guide-companies.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [GuideCompaniesController, AdminGuideCompaniesController],
})
export class GuideCompaniesModule {}
