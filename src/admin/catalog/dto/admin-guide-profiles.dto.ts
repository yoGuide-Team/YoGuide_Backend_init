import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { GuideType, Language } from '@prisma/client';

export class GuideProfileBodyDto {
  @ApiProperty({ description: 'User id (UUID) with role GUIDE', example: 'clx00000000000000000000001' })
  @IsString()
  userId!: string;

  @ApiProperty({ enum: GuideType, enumName: 'GuideType', example: GuideType.INDIVIDUAL })
  @IsEnum(GuideType)
  guideType!: GuideType;

  @ApiPropertyOptional({ example: 'Kigali Tours Ltd', description: 'Required when guideType is COMPANY' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({
    enum: Language,
    enumName: 'Language',
    isArray: true,
    example: [Language.EN, Language.FR],
  })
  @IsArray()
  @IsEnum(Language, { each: true })
  languages!: Language[];

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfTours?: number;
}

export class UpdateGuideProfileDto {
  @ApiPropertyOptional({ enum: GuideType, enumName: 'GuideType' })
  @IsOptional()
  @IsEnum(GuideType)
  guideType?: GuideType;

  @ApiPropertyOptional({ example: 'Kigali Tours Ltd' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({
    enum: Language,
    enumName: 'Language',
    isArray: true,
    example: [Language.EN, Language.RW],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Language, { each: true })
  languages?: Language[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfTours?: number;
}
