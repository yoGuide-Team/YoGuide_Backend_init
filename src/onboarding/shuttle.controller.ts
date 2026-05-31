import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('bookings')
@UseGuards(AuthGuard)
export class ShuttleController {
  constructor(private readonly svc: OnboardingService) {}

  /** POST /bookings/shuttle */
  @Post('shuttle')
  async bookShuttle(
    @Req() req: { user: { id: string } },
    @Body() body: { dropOffPoint: string; slotTime: string },
  ) {
    return this.svc.bookShuttle(req.user.id, body.dropOffPoint, body.slotTime);
  }
}