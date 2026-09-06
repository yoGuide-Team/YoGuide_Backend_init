import { Module } from '@nestjs/common';
import { GuideController } from './guide.controller';
import { GuideGastronomyController } from './guide-gastronomy.controller';
import { GuideExperiencesController } from './guide-experiences.controller';
import { GuidePackagesController } from './guide-packages.controller';
import { GuideStatsController } from './guide-stats.controller';
import { GuideRoleGuard } from './guide-role.guard';

@Module({
  controllers: [
    GuideController,
    GuideGastronomyController,
    GuideExperiencesController,
    GuidePackagesController,
    GuideStatsController,
  ],
  providers: [GuideRoleGuard],
})
export class GuideModule {}
