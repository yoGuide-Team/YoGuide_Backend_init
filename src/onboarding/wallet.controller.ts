import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly svc: OnboardingService) {}

  /** POST /wallet/topup */
  @Post('topup')
  async topUp(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      amount: number;
      sourceCurrency: string;
      cardToken: string;
      currency: string;
    },
  ) {
    return this.svc.topUpWallet(
      req.user.id,
      body.amount,
      body.sourceCurrency,
      body.cardToken,
    );
  }
}