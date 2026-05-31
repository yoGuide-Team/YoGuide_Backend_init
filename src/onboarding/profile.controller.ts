import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('me')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    private readonly svc: OnboardingService,
    private readonly notifications: NotificationsService,
  ) {}

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
    const result = await this.svc.saveTripProfile(req.user.id, body);

    await this.notifications.notifyTripProfile(
      req.user.id,
      body.experienceTypes ?? [],
      [],
    );

    return result;
  }

  /** POST /me/event-interests */
  @Post('event-interests')
  async saveEventInterests(
    @Req() req: { user: { id: string } },
    @Body() body: { eventIds: string[]; reminderEnabled: boolean },
  ) {
    const result = await this.svc.saveEventInterests(
      req.user.id,
      body.eventIds,
      body.reminderEnabled,
    );

    await this.notifications.notifyEventInterests(
      req.user.id,
      body.eventIds ?? [],
    );

    return result;
  }
}