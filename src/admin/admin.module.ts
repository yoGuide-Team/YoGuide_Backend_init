import { Module } from '@nestjs/common';
import { AdminWalletsController } from './admin-wallets.controller';
import { AdminRoleGuard } from './guards/admin-role.guard';

@Module({
  controllers: [AdminWalletsController],
  providers: [AdminRoleGuard],
})
export class AdminModule {}
