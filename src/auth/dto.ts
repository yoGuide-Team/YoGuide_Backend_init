import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Language, UserRole, VisitorType } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'hunter2hunter2', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Jane Tourist' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: 'Rwanda' })
  @IsString()
  @MinLength(2)
  nationality!: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@yoguide.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Y0guide#Admin2026' })
  @IsString()
  password!: string;
}

export class VerifyRegisterOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class GoogleLoginDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIs...',
    description:
      'Google ID token from Flutter google_sign_in or web Google Sign-In. Preferred field — send as { "idToken": "<token>" }.',
  })
  @IsOptional()
  @IsString()
  idToken?: string;

  @ApiPropertyOptional({ description: 'Alias for idToken (legacy clients).' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Google One Tap credential (web).' })
  @IsOptional()
  @IsString()
  credential?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string;
}

export class VerifyResetOtpDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '123456', description: '6-digit code from the password reset email.' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Short-lived token returned by POST /auth/verify-reset-otp after OTP is verified.',
  })
  @IsString()
  @IsNotEmpty()
  resetToken!: string;

  @ApiProperty({ example: 'NewSecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyResetOtpResponse {
  @ApiProperty({ example: 'jane@example.com' })
  email!: string;

  @ApiProperty({
    description: 'Present this with the new password on POST /auth/reset-password. Expires in 15 minutes.',
  })
  resetToken!: string;

  @ApiProperty({ example: 'OTP verified. You may now set a new password.' })
  message!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Tourist', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Rwanda' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ enum: VisitorType, enumName: 'VisitorType' })
  @IsOptional()
  @IsEnum(VisitorType)
  visitorType?: VisitorType;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/jane.jpg' })
  @IsOptional()
  @IsString()
  profileImage?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  arrivalDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  departureDate?: string;

  @ApiPropertyOptional({ enum: Language, enumName: 'Language' })
  @IsOptional()
  @IsEnum(Language)
  defaultLanguage?: Language;

  @ApiPropertyOptional({ description: 'Region id (UUID) — where the user currently is. Use GET /catalog/regions to list options.' })
  @IsOptional()
  @IsString()
  currentRegionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

export class RegisterPendingResponse {
  @ApiProperty({ example: true })
  requiresVerification!: boolean;

  @ApiProperty({ example: 'jane@example.com' })
  email!: string;

  @ApiProperty({
    example: 'Registration successful. Please enter the verification code sent to your email.',
  })
  message!: string;
}

export class UserRegionSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Kigali' })
  name!: string;
}

export class UserProfileResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty()
  nationality!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiPropertyOptional({ enum: VisitorType, enumName: 'VisitorType' })
  visitorType?: VisitorType | null;

  @ApiPropertyOptional()
  profileImage?: string | null;

  @ApiPropertyOptional()
  arrivalDate?: Date | null;

  @ApiPropertyOptional()
  departureDate?: Date | null;

  @ApiPropertyOptional({ enum: Language, enumName: 'Language' })
  defaultLanguage?: Language | null;

  @ApiPropertyOptional()
  currentRegionId?: string | null;

  @ApiPropertyOptional({ type: UserRegionSummary, nullable: true })
  currentRegion?: UserRegionSummary | null;

  @ApiProperty()
  inAppNotifications!: boolean;

  @ApiProperty()
  emailNotifications!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Must match the account\'s current password.' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ example: 'newpassword1', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
