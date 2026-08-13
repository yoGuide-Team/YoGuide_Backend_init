import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ApiErrorResponse, AuthUserResponse } from '../common/responses';

@ApiTags('Account')
@ApiBearerAuth('access-token')
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  @Get()
  @ApiOperation({ summary: 'Current user (re-fetched from DB)' })
  @ApiOkResponse({ type: AuthUserResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  whoAmI(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
