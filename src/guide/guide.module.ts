import { Module } from '@nestjs/common';
import { GuideController } from './guide.controller';
import { GuideRoleGuard } from './guide-role.guard';

@Module({
  controllers: [GuideController],
  providers: [GuideRoleGuard],
})
export class GuideModule {}
