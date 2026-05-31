import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { PlacesModule } from './places/places.module';
import { BookingsModule } from './bookings/bookings.module';
import { WalletModule } from './wallet/wallet.module';
import { CitiesModule } from './cities/cities.module';
import { ToursModule } from './tours/tours.module';
import { GuidesModule } from './guides/guides.module';
import { ReviewsModule } from './reviews/reviews.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ItinerariesModule } from './itineraries/itineraries.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagesModule } from './messages/messages.module';
import { VendorsModule } from './vendors/vendors.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { EventsModule } from './events/events.module';
import { PhrasesModule } from './phrases/phrases.module';
import { FilesModule } from './files/files.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OnboardingModule,
    HealthModule,
    MeModule,
    PlacesModule,
    BookingsModule,
    WalletModule,
    CitiesModule,
    ToursModule,
    GuidesModule,
    ReviewsModule,
    FavoritesModule,
    ItinerariesModule,
    NotificationsModule,
    MessagesModule,
    VendorsModule,
    ProductsModule,
    OrdersModule,
    EventsModule,
    PhrasesModule,
    FilesModule,
    AnalyticsModule,
    AdminModule,
  ],
})
export class AppModule {}
