import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { IdentityStatus, Language, UserRole, VisitorType } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane Tourist', minLength: 2 })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'hunter2hunter2', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Rwanda' })
  @IsString()
  nationality!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.TOURIST })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ enum: VisitorType, enumName: 'VisitorType' })
  @IsOptional()
  @IsEnum(VisitorType)
  visitorType?: VisitorType;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/jane.jpg' })
  @IsOptional()
  @IsString()
  profileImage?: string;

  @ApiPropertyOptional({ example: '2026-08-15T00:00:00.000Z', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  arrivalDate?: string;

  @ApiPropertyOptional({ example: '2026-08-20T00:00:00.000Z', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  departureDate?: string;

  @ApiPropertyOptional({ enum: Language, enumName: 'Language', example: Language.EN })
  @IsOptional()
  @IsEnum(Language)
  defaultLanguage?: Language;

  @ApiPropertyOptional({ description: 'Region id (UUID)', example: 'clx00000000000000000000001' })
  @IsOptional()
  @IsString()
  currentRegionId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

export class UpdateUserDto {
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

  @ApiPropertyOptional({ example: 'newpassword1', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ example: 'Rwanda' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

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

  @ApiPropertyOptional({ description: 'Region id (UUID)' })
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

  @ApiPropertyOptional({
    enum: IdentityStatus,
    enumName: 'IdentityStatus',
    description: 'Move a pending KYC submission to APPROVED/REJECTED.',
  })
  @IsOptional()
  @IsEnum(IdentityStatus)
  identityStatus?: IdentityStatus;

  @ApiPropertyOptional({ description: 'Shown to the user when identityStatus is REJECTED.' })
  @IsOptional()
  @IsString()
  identityRejectionReason?: string;
}
