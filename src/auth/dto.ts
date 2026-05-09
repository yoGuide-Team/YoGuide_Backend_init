import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'jane@example.com',
    description: 'Account email — case-insensitive, used as the unique key.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'hunter2hunter2',
    description: 'Plaintext password. Hashed with bcrypt server-side. Minimum 8 characters.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'Jane Tourist',
    required: false,
    description: 'Display name. Optional; defaults to null.',
  })
  @IsOptional()
  @IsString()
  fullName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@yoguide.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Y0guide#Admin2026' })
  @IsString()
  password!: string;
}
