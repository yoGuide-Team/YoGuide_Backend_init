import { Module } from '@nestjs/common';
import { AdminReviewsController, ReviewsController } from './reviews.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReviewsController, AdminReviewsController],
})
export class ReviewsModule {}
