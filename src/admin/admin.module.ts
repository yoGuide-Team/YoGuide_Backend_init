import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminRolesController } from './admin-roles.controller';
import { AdminPlacesController } from './admin-places.controller';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminWalletsController } from './admin-wallets.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminAuditController } from './admin-audit.controller';
import { PlacesService } from '../places/places.service';
import { BookingsService } from '../bookings/bookings.service';

@Module({
  controllers: [
    AdminUsersController,
    AdminRolesController,
    AdminPlacesController,
    AdminBookingsController,
    AdminWalletsController,
    AdminStatsController,
    AdminAuditController,
  ],
  providers: [PlacesService, BookingsService],
})
export class AdminModule {}
