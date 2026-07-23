import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { WalletService } from './wallet.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ApiErrorResponse, WalletResponse } from '../common/responses';

class TopUpDto {
  @ApiProperty({ example: 20000, description: 'Top-up amount in integer cents (min 1).' })
  @IsInt() @Min(1)
  amountCents!: number;

  @ApiProperty({ enum: ['card', 'momo', 'cash'], example: 'card' })
  @IsIn(['card', 'momo', 'cash'])
  method!: string;
}

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
      "Returns the signed-in user's wallet (auto-created on first read) plus the 50 most recent transactions. Balances are integer cents — never floats — to keep arithmetic exact.",
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
    description:
      "Records a settled top-up transaction and credits the wallet. Mock for now — replace with a Flutterwave / MoMo callback once payment processors are integrated. Real processors will hit a `/webhooks/*` endpoint instead of being driven by the client.",
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
