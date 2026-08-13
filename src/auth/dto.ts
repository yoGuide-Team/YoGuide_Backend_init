import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

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

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.TOURIST })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@yoguide.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Y0guide#Admin2026' })
  @IsString()
  password!: string;
}
