import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  RegisterDto,
  RegisterPendingResponse,
  ResendOtpDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UserProfileResponse,
  VerifyRegisterOtpDto,
  VerifyResetOtpDto,
  VerifyResetOtpResponse,
} from './dto';
import { ApiErrorResponse, AuthSessionResponse } from '../common/responses';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user';

@ApiTags('Account')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new tourist account',
    description:
      'Creates an unverified TOURIST account and emails a 6-digit OTP. Returns requiresVerification — no JWT until OTP is verified.',
  })
  @ApiCreatedResponse({ type: RegisterPendingResponse })
  @ApiConflictResponse({ type: ApiErrorResponse })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-register-otp')
  @ApiOperation({ summary: 'Verify registration OTP' })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  verifyRegisterOtp(@Body() dto: VerifyRegisterOtpDto) {
    return this.auth.verifyRegisterOtp(dto.email, dto.code);
  }

  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend verification OTP' })
  @ApiOkResponse({ description: 'Fresh verification code sent (or generic message).' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.auth.sendOtpByEmail(dto.email);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Blocks unverified accounts with EMAIL_NOT_VERIFIED and auto-resends OTP.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  @ApiOperation({
    summary: 'Google Sign-In',
    description:
      'Verifies a Google ID token and returns a yoGuide JWT. ' +
      'Send `{ "idToken": "<google id token>" }` from Flutter `google_sign_in`. ' +
      'Also accepts `token`, `credential`, or nested `payload.idToken` for legacy/web clients.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  @ApiBody({ type: GoogleLoginDto })
  loginWithGoogle(@Body() body: Record<string, unknown>) {
    const payload =
      body?.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : undefined;

    const token =
      (typeof body?.token === 'string' && body.token) ||
      (typeof body?.idToken === 'string' && body.idToken) ||
      (typeof body?.credential === 'string' && body.credential) ||
      (typeof payload?.token === 'string' && payload.token) ||
      (typeof payload?.idToken === 'string' && payload.idToken) ||
      (typeof payload?.credential === 'string' && payload.credential);

    if (!token) {
      throw new BadRequestException({
        message: 'Google authentication failed',
        error: 'Google token is required.',
      });
    }

    return this.auth.loginWithGoogle(token);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get current user (JWT payload)',
    description: 'Returns the authenticated user record including permissions and verification flags.',
  })
  @ApiOkResponse({ description: 'Currently authenticated user.' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update my profile',
    description:
      'Partial update — send only the fields you want to change. Role is never changed via this endpoint. ' +
      'Use currentRegionId to set where the user currently is (onboarding or when they travel).',
  })
  @ApiOkResponse({ type: UserProfileResponse })
  @ApiConflictResponse({ type: ApiErrorResponse })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout (client-side token discard)' })
  logout() {
    return { ok: true };
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request password reset OTP',
    description:
      'Emails a 6-digit code. Call again to resend. Always returns a generic success message.',
  })
  @ApiOkResponse({ description: 'Always returns success (no email enumeration).' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('verify-reset-otp')
  @ApiOperation({
    summary: 'Verify password reset OTP',
    description:
      'Checks the 6-digit code from email. On success returns a short-lived resetToken for the new-password step.',
  })
  @ApiOkResponse({ type: VerifyResetOtpResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.auth.verifyResetOtp(dto.email, dto.code);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Set new password after OTP verification',
    description: 'Requires resetToken from POST /auth/verify-reset-otp. Expires in 15 minutes.',
  })
  @ApiOkResponse({ description: 'Password reset successful.' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.resetToken, dto.password);
  }
}
