import { Module } from '@nestjs/common';
import { AdminAnalyticsController, AnalyticsController } from './analytics.controller';

@Module({ controllers: [AnalyticsController, AdminAnalyticsController] })
export class AnalyticsModule {}
