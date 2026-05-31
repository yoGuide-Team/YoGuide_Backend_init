import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('me')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly svc: OnboardingService) {}

  /** POST /me/trip-profile */
  @Post('trip-profile')
  async saveTripProfile(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      destinationCity: string;
      arrivalDate?: string;
      departureDate?: string;
      tripPurpose?: string;
      nationality?: string;
      freeSlots?: { day: number; slot: string }[];
      experienceTypes?: string[];
    },
  ) {
    return this.svc.saveTripProfile(req.user.id, body);
  }

  /** POST /me/event-interests */
  @Post('event-interests')
  async saveEventInterests(
    @Req() req: { user: { id: string } },
    @Body() body: { eventIds: string[]; reminderEnabled: boolean },
  ) {
    return this.svc.saveEventInterests(
      req.user.id,
      body.eventIds,
      body.reminderEnabled,
    );
  }
}