import { Module } from '@nestjs/common';
import { AdminRegionsController } from './admin-regions.controller';
import { AdminTourTypesController } from './admin-tour-types.controller';
import { AdminPackagesController } from './admin-packages.controller';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { AdminGuideProfilesController } from './admin-guide-profiles.controller';
import { AdminGuideVehiclesController } from './admin-guide-vehicles.controller';
import { AdminCatalogUsersController } from './admin-catalog-users.controller';
import { AdminCatalogReviewsController } from './admin-catalog-reviews.controller';
import { AdminCatalogBookingsController } from './admin-catalog-bookings.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminGastronomyCategoriesController } from './admin-gastronomy-categories.controller';
import { AdminRoleGuard } from '../guards/admin-role.guard';

@Module({
  controllers: [
    AdminRegionsController,
    AdminTourTypesController,
    AdminPackagesController,
    AdminVehiclesController,
    AdminGuideProfilesController,
    AdminGuideVehiclesController,
    AdminCatalogUsersController,
    AdminCatalogReviewsController,
    AdminCatalogBookingsController,
    AdminPaymentsController,
    AdminGastronomyCategoriesController,
  ],
  providers: [AdminRoleGuard],
})
export class CatalogAdminModule {}
