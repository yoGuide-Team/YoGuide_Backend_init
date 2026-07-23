import {
  Body,
  Controller,
  Get,
  Post,
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
import {
  LoginDto,
  RegisterDto,
  GoogleLoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyOtpDto,
  VerifyRegisterOtpDto,
  ResendOtpDto
} from "./dto";
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
      "Creates a new account with unverified status and dispatches a 6-digit OTP verification code to the email address. Returns `{ requiresVerification: true, email }`.",
  })
  @ApiCreatedResponse({
    description: "Account created. Verification code sent via email.",
  })
  @ApiBadRequestResponse({ type: ApiErrorResponse })
  @ApiConflictResponse({ type: ApiErrorResponse })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

 @Post("verify-register-otp")
@ApiOperation({
  summary: "Verify registration OTP",
  description:
    "Public endpoint to verify the 6-digit code sent after registration or unverified login.",
})
@ApiOkResponse({ type: AuthSessionResponse })
@ApiBadRequestResponse({ type: ApiErrorResponse })
@ApiUnauthorizedResponse({ type: ApiErrorResponse })
verifyRegisterOtp(@Body() dto: VerifyRegisterOtpDto) {
  return this.auth.verifyRegisterOtp(dto.email, dto.code);
}

 @Post("resend-otp")
@ApiOperation({
  summary: "Resend verification OTP",
  description:
    "Public endpoint to dispatch a fresh 6-digit verification code to the specified email address.",
})
@ApiOkResponse({ description: "Fresh verification code sent." })
@ApiBadRequestResponse({ type: ApiErrorResponse })
resendOtp(@Body() dto: ResendOtpDto) {
  return this.auth.sendOtpByEmail(dto.email);
}

  @Post("login")
  @ApiOperation({
    summary: "Login",
    description:
      "Email + password login. Returns a JWT and user record. If the account email is not verified, blocks access and sends a new OTP code.",
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
      "Google accounts are automatically treated as verified (`emailVerified: true`).",
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
      "The Flutter client should delete its local token on logout.",
  })
  @ApiOkResponse({ description: "Always returns { ok: true }." })
  logout() {
    return { ok: true };
  }

  @Post("forgot-password")
  @ApiOperation({
    summary: "Forgot Password",
    description: "Generates a password reset token and sends a reset email.",
  })
  @ApiOkResponse({
    description: "Always returns success even if the email does not exist.",
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @ApiOperation({
    summary: "Reset Password",
    description: "Resets a user's password using a valid reset token.",
  })
  @ApiOkResponse({ description: "Password reset successful." })
  @ApiBadRequestResponse({ type: ApiErrorResponse })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post("verify-otp")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Verify email with OTP code (Authenticated)",
    description:
      "Checks the code sent by POST /auth/send-otp and marks the account emailVerified.",
  })
  @ApiOkResponse({ description: "Email verified." })
  @ApiBadRequestResponse({ type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  verifyOtp(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(user.id, dto.code);
  }
}