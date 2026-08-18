import { Module } from '@nestjs/common';
import { GuideController } from './guide.controller';
import { GuideGastronomyController } from './guide-gastronomy.controller';
import { GuideExperiencesController } from './guide-experiences.controller';
import { GuideRoleGuard } from './guide-role.guard';

@Module({
  controllers: [GuideController, GuideGastronomyController, GuideExperiencesController],
  providers: [GuideRoleGuard],
})
export class GuideModule {}
