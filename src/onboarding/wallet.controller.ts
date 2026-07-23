import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

// Deliberately not `@Controller('wallet')` — src/wallet/wallet.controller.ts
// already owns POST /wallet/topup for the real wallet feature. This is the
// onboarding "convenience account" top-up (amount/sourceCurrency/cardToken),
// a distinct flow; the two silently collided on the same route before this
// was namespaced (Express/Nest let the later-registered one win at runtime).
@Controller('onboarding/wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly svc: OnboardingService) {}

  /** POST /onboarding/wallet/topup */
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