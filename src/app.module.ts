import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { HealthModule } from './health/health.module';
import { FilesModule } from './files/files.module';
import { WalletModule } from './wallet/wallet.module';
import { AdminModule } from './admin/admin.module';
import { CatalogAdminModule } from './admin/catalog/catalog-admin.module';
import { CatalogModule } from './catalog/catalog.module';
import { BookingModule } from './booking/booking.module';
import { GuideModule } from './guide/guide.module';
import { HotelModule } from './hotel/hotel.module';
import { HotelSearchProxyModule } from './hotel-search-proxy/hotel-search-proxy.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ItinerariesModule } from './itineraries/itineraries.module';
import { CitiesModule } from './cities/cities.module';
import { EsimModule } from './esim/esim.module';
import { PaymentsModule } from './payments/payments.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { AvailabilityModule } from './availability/availability.module';
import { GuideApplicationsModule } from './guide-applications/guide-applications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Baseline rate limiting for every route. Auth routes tighten this
    // further with their own @Throttle decorators — without this, OTP codes
    // and passwords were brute-forceable at unlimited speed.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    MailModule,
    AuthModule,
    MeModule,
    HealthModule,
    FilesModule,
    WalletModule,
    AdminModule,
    CatalogAdminModule,
    CatalogModule,
    BookingModule,
    GuideModule,
    HotelModule,
    HotelSearchProxyModule,
    MessagesModule,
    NotificationsModule,
    ItinerariesModule,
    CitiesModule,
    EsimModule,
    PaymentsModule,
    ChatbotModule,
    RecommendationsModule,
    AvailabilityModule,
    GuideApplicationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
