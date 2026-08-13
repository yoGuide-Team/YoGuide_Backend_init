import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { WalletModule } from './wallet/wallet.module';
import { AdminModule } from './admin/admin.module';
import { CatalogAdminModule } from './admin/catalog/catalog-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    WalletModule,
    AdminModule,
    CatalogAdminModule,
  ],
})
export class AppModule {}
