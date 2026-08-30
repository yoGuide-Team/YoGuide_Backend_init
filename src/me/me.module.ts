import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeTripsController } from './trips.controller';
import { MeIdentityVerificationController } from './me-identity-verification.controller';
import { MeEventInterestsController } from './event-interests.controller';

@Module({
  controllers: [
    MeController,
    MeTripsController,
    MeIdentityVerificationController,
    MeEventInterestsController,
  ],
})
export class MeModule {}
