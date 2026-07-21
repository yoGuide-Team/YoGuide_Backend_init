import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "jane@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "hunter2hunter2", minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "Jane Tourist", required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ example: "+250788000000", required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: "Visitor",
    required: false,
    description:
      "Flutter userType: 'Visitor' | 'Resident' | 'Hospitality Card Holder'",
  })
  @IsOptional()
  @IsString()
  userType?: string;

  @ApiProperty({ example: "CARD-001", required: false })
  @IsOptional()
  @IsString()
  cardNumber?: string;
}

export class LoginDto {
  @ApiProperty({ example: "admin@yoguide.app" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Y0guide#Admin2026" })
  @IsString()
  password!: string;
}

export class GoogleLoginDto {
  @ApiProperty({
    description:
      "Google ID token from the Flutter `google_sign_in` package — " +
      "`(await googleUser.authentication).idToken`.",
    example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  @IsString()
  idToken!: string;
}
export class ForgotPasswordDto {
  @ApiProperty({
    example: "jane@example.com",
    description: "Email address associated with the account.",
  })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: "Password reset token received via email.",
    example: "a1b2c3d4e5f6...",
  })
  @IsString()
  token!: string;

  @ApiProperty({
    example: "NewSecurePassword123!",
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;
}

// import { ApiProperty } from '@nestjs/swagger';
// import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

// export class RegisterDto {
//   @ApiProperty({
//     example: 'jane@example.com',
//     description: 'Account email — case-insensitive, used as the unique key.',
//   })
//   @IsEmail()
//   email!: string;

//   @ApiProperty({
//     example: 'hunter2hunter2',
//     description: 'Plaintext password. Hashed with bcrypt server-side. Minimum 8 characters.',
//     minLength: 8,
//   })
//   @IsString()
//   @MinLength(8)
//   password!: string;

//   @ApiProperty({
//     example: 'Jane Tourist',
//     required: false,
//     description: 'Display name. Optional; defaults to null.',
//   })
//   @IsOptional()
//   @IsString()
//   fullName?: string;
// }

// export class LoginDto {
//   @ApiProperty({ example: 'admin@yoguide.app' })
//   @IsEmail()
//   email!: string;

//   @ApiProperty({ example: 'Y0guide#Admin2026' })
//   @IsString()
//   password!: string;
// }
