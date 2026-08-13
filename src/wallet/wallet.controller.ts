import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ApiErrorResponse, WalletResponse } from '../common/responses';
import { TopUpDto } from './wallet.dto';

@ApiTags('Wallet')
@ApiBearerAuth('access-token')
@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({
    summary: 'My wallet',
    description:
      "Returns the signed-in user's wallet (auto-created on first read) plus the 50 most recent transactions.",
  })
  @ApiOkResponse({ description: 'Wallet + recent transactions.', type: WalletResponse })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid bearer token.',
    type: ApiErrorResponse,
  })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.getOrCreateForUser(user.id);
  }

  @Post('topup')
  @ApiOperation({
    summary: 'Top up wallet (mock)',
    description: 'Records a settled top-up transaction and credits the wallet.',
  })
  @ApiCreatedResponse({ description: 'Wallet after the top-up.', type: WalletResponse })
  @ApiBadRequestResponse({ description: 'Validation failed.', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', type: ApiErrorResponse })
  topUp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TopUpDto,
  ) {
    return this.wallet.topUp(user.id, dto.amountCents, dto.method);
  }
}
