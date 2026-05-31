import { Controller, Get, UseGuards } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
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
  @ApiOperation({
    summary: 'Current user',
    description:
      "Returns the user record for the bearer token, including the materialised permission set computed from the user's role on this request. Re-fetched from DB on every call, so role/permission changes take effect immediately without a token refresh.",
  })
  @ApiOkResponse({
    description: "Current user, with permissions resolved at this moment.",
    type: AuthUserResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, malformed, or expired bearer token.',
    type: ApiErrorResponse,
  })
  whoAmI(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
