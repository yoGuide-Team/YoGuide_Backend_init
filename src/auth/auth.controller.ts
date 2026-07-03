import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto, GoogleLoginDto } from "./dto";
import { ApiErrorResponse, AuthSessionResponse } from "../common/responses";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import type { AuthenticatedUser } from "./authenticated-user";

@ApiTags("Account")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOperation({
    summary: "Register",
    description:
      "Creates a new account with the default `user` role. Returns a 30-day JWT and the user record.",
  })
  @ApiCreatedResponse({ type: AuthSessionResponse })
  @ApiBadRequestResponse({ type: ApiErrorResponse })
  @ApiConflictResponse({ type: ApiErrorResponse })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  @ApiOperation({
    summary: "Login",
    description: "Email + password login. Returns a JWT and the user record.",
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiBadRequestResponse({ type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("google")
  @ApiOperation({
    summary: "Google Sign-In",
    description:
      "Accepts a Google ID token from the Flutter `google_sign_in` package, verifies it " +
      "with Google, then returns the same `{ access_token, user }` shape as regular login. " +
      "Creates an account automatically if one does not already exist. If an account with the " +
      "same email already exists (email+password), the Google ID is linked to it.",
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  // ── /auth/me — mirrors /me but reachable at the path the frontend expects ──

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get current user (alias)",
    description:
      "Returns the currently authenticated user. Alias of `GET /me` — included " +
      "because the Flutter client calls `/auth/me` after login.",
  })
  @ApiOkResponse({ description: "Currently authenticated user." })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post("logout")
  @ApiOperation({
    summary: "Logout (no-op)",
    description:
      "This backend uses stateless JWT — there is no server-side session to invalidate. " +
      "The Flutter client should delete its local token on logout. This endpoint exists " +
      "purely so Flutter calls do not result in a 404.",
  })
  @ApiOkResponse({ description: "Always returns { ok: true }." })
  logout() {
    return { ok: true };
  }
}


// import { Body, Controller, Post } from '@nestjs/common';
// import {
//   ApiBadRequestResponse,
//   ApiConflictResponse,
//   ApiCreatedResponse,
//   ApiOkResponse,
//   ApiOperation,
//   ApiTags,
//   ApiUnauthorizedResponse,
// } from '@nestjs/swagger';
// import { AuthService } from './auth.service';
// import { LoginDto, RegisterDto } from './dto';
// import { ApiErrorResponse, AuthSessionResponse } from '../common/responses';

// @ApiTags('Account')
// @Controller('auth')
// export class AuthController {
//   constructor(private readonly auth: AuthService) {}

//   @Post('register')
//   @ApiOperation({
//     summary: 'Register',
//     description:
//       "Creates a new account with the default `user` role. Higher roles are assigned by an admin via `PATCH /admin/users/:id` — never by the registrant. Returns a 30-day JWT and the user record (with the materialised permission set).",
//   })
//   @ApiCreatedResponse({
//     description: 'Account created. Bearer token included in response.',
//     type: AuthSessionResponse,
//   })
//   @ApiBadRequestResponse({
//     description: 'Validation failed (e.g. malformed email, password too short).',
//     type: ApiErrorResponse,
//   })
//   @ApiConflictResponse({
//     description: 'An account with that email already exists.',
//     type: ApiErrorResponse,
//   })
//   register(@Body() dto: RegisterDto) {
//     return this.auth.register(dto);
//   }

//   @Post('login')
//   @ApiOperation({
//     summary: 'Login',
//     description:
//       'Verifies email + bcrypt password hash. Returns a JWT and the user record (with role label and materialised permission set computed from the role at request time).',
//   })
//   @ApiOkResponse({
//     description: 'Authenticated successfully.',
//     type: AuthSessionResponse,
//   })
//   @ApiBadRequestResponse({
//     description: 'Validation failed.',
//     type: ApiErrorResponse,
//   })
//   @ApiUnauthorizedResponse({
//     description: 'Invalid email or password.',
//     type: ApiErrorResponse,
//   })
//   login(@Body() dto: LoginDto) {
//     return this.auth.login(dto);
//   }
// }
