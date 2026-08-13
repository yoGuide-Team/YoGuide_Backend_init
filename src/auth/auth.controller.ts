import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { ApiErrorResponse, AuthSessionResponse } from '../common/responses';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user';

@ApiTags('Account')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  @ApiCreatedResponse({ type: AuthSessionResponse })
  @ApiConflictResponse({ type: ApiErrorResponse })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user' })
  @ApiOkResponse({ description: 'Currently authenticated user.' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout (client-side token discard)' })
  logout() {
    return { ok: true };
  }
}
