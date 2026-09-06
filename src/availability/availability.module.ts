import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityService } from './availability.service';
import {
  GuideAvailabilityController,
  PublicAvailabilityController,
} from './availability.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PublicAvailabilityController, GuideAvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
