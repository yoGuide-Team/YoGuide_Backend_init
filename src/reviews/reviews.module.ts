import { Module } from '@nestjs/common';
import { AdminReviewsController, ReviewsController } from './reviews.controller';

@Module({ controllers: [ReviewsController, AdminReviewsController] })
export class ReviewsModule {}
