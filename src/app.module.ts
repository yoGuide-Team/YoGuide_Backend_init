import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { HealthModule } from './health/health.module';
import { WalletModule } from './wallet/wallet.module';
import { AdminModule } from './admin/admin.module';
import { CatalogAdminModule } from './admin/catalog/catalog-admin.module';
import { CatalogModule } from './catalog/catalog.module';
import { BookingModule } from './booking/booking.module';
import { GuideModule } from './guide/guide.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuthModule,
    MeModule,
    HealthModule,
    WalletModule,
    AdminModule,
    CatalogAdminModule,
    CatalogModule,
    BookingModule,
    GuideModule,
  ],
})
export class AppModule {}
