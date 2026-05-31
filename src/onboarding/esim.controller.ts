import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('orders')
@UseGuards(AuthGuard)
export class EsimController {
  constructor(private readonly svc: OnboardingService) {}

  /** POST /orders/esim */
  @Post('esim')
  async orderEsim(
    @Req() req: { user: { id: string } },
    @Body() body: { bundleId: string; deliveryEmail: string },
  ) {
    return this.svc.orderEsim(req.user.id, body.bundleId, body.deliveryEmail);
  }
}