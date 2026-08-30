import {
  Body,
  ConflictException,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { generateShortCode } from '../common/short-code';

class ApplyHotelDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsArray()
  amenities?: string[];

  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;
}

/// Self-serve "register your hotel" entry point — any authenticated user
/// may apply. Unlike HotelController (gated by HotelRoleGuard, requires the
/// caller to already hold the HOTEL_MANAGER role), this endpoint is the
/// *only* way to get a Hotel row created in the first place. The resulting
/// row starts unverified; an admin reviews it via GET /admin/hotels and
/// promotes both the Hotel and the applicant's role through
/// POST /admin/hotels/:id/verify. Until then the caller still can't reach
/// /hotel/* (HotelRoleGuard still blocks them), which is the intended gate.
@ApiTags('Hotel · Apply')
@ApiBearerAuth('access-token')
@Controller('hotel')
@UseGuards(AuthGuard)
export class HotelApplyController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('apply')
  @ApiOperation({ summary: 'Apply to register a hotel (creates an unverified profile)' })
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyHotelDto,
  ) {
    const existing = await this.prisma.hotel.findUnique({
      where: { managerId: user.id },
    });
    if (existing) {
      throw new ConflictException(
        existing.isVerified
          ? 'You already manage a hotel.'
          : 'Your application is already pending review.',
      );
    }

    return this.prisma.hotel.create({
      data: {
        managerId: user.id,
        name: dto.name,
        description: dto.description,
        city: dto.city,
        address: dto.address,
        amenities: dto.amenities ?? [],
        checkInTime: dto.checkInTime,
        checkOutTime: dto.checkOutTime,
        contact: dto.contact,
        phone: dto.phone,
        website: dto.website,
        isVerified: false,
        code: await this.uniqueHotelCode(),
      },
    });
  }

  private async uniqueHotelCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateShortCode();
      const clash = await this.prisma.hotel.findUnique({ where: { code } });
      if (!clash) return code;
    }
    throw new Error('Could not generate a unique hotel code.');
  }
}
