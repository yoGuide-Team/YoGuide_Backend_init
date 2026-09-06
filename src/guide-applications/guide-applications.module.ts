import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AdminGuideApplicationsController,
  GuideApplyController,
} from './guide-applications.controller';
import { ActivationController } from './activation.controller';
import { AccountProvisioningService } from './account-provisioning.service';

@Module({
  imports: [PrismaModule, MailModule, AuthModule, NotificationsModule],
  controllers: [GuideApplyController, AdminGuideApplicationsController, ActivationController],
  providers: [AccountProvisioningService],
  exports: [AccountProvisioningService],
})
export class GuideApplicationsModule {}
