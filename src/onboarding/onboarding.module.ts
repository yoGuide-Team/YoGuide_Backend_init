import { Module } from '@nestjs/common';
import { EsimController } from './esim.controller';
import { ShuttleController } from './shuttle.controller';
import { WalletController } from './wallet.controller';
import { ProfileController } from './profile.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  controllers: [
    EsimController,
    ShuttleController,
    WalletController,
    ProfileController,
  ],
  providers: [OnboardingService],
})
export class OnboardingModule {}