import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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

@ApiTags('Account')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register',
    description:
      "Creates a new account with the default `user` role. Higher roles are assigned by an admin via `PATCH /admin/users/:id` — never by the registrant. Returns a 30-day JWT and the user record (with the materialised permission set).",
  })
  @ApiCreatedResponse({
    description: 'Account created. Bearer token included in response.',
    type: AuthSessionResponse,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed (e.g. malformed email, password too short).',
    type: ApiErrorResponse,
  })
  @ApiConflictResponse({
    description: 'An account with that email already exists.',
    type: ApiErrorResponse,
  })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login',
    description:
      'Verifies email + bcrypt password hash. Returns a JWT and the user record (with role label and materialised permission set computed from the role at request time).',
  })
  @ApiOkResponse({
    description: 'Authenticated successfully.',
    type: AuthSessionResponse,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed.',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
    type: ApiErrorResponse,
  })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
