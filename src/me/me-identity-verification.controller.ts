import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { IdentityStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class SubmitIdentityVerificationDto {
  @IsArray()
  @IsString({ each: true })
  docUrls!: string[];
}

const STATUS_TO_WIRE: Record<IdentityStatus, string> = {
  NONE: 'none',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/// KYC gate for wallet features. Doc uploads go through POST
/// /files/sign-upload first — that endpoint is itself a stub (fake CDN
/// URL, no real storage), so a submission here records URLs that don't
/// resolve to real files yet. An admin moves a PENDING submission to
/// APPROVED/REJECTED via PATCH /admin/users/:id (identityStatus,
/// identityRejectionReason) — no dedicated admin review UI exists yet.
@ApiTags('Account · Identity Verification')
@ApiBearerAuth('access-token')
@Controller('me/identity-verification')
@UseGuards(AuthGuard)
export class MeIdentityVerificationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'My identity verification status' })
  async myStatus(@CurrentUser() user: AuthenticatedUser) {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { identityStatus: true, identityDocUrls: true, identityRejectionReason: true },
    });
    return this.toWire(row);
  }

  @Post()
  @ApiOperation({ summary: 'Submit documents for identity verification' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitIdentityVerificationDto,
  ) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        identityStatus: IdentityStatus.PENDING,
        identityDocUrls: dto.docUrls,
        identityRejectionReason: null,
      },
      select: { identityStatus: true, identityDocUrls: true, identityRejectionReason: true },
    });
    return this.toWire(updated);
  }

  private toWire(row: {
    identityStatus: IdentityStatus;
    identityDocUrls: string[];
    identityRejectionReason: string | null;
  }) {
    return {
      identityStatus: STATUS_TO_WIRE[row.identityStatus],
      identityDocUrls: row.identityDocUrls,
      identityRejectionReason: row.identityRejectionReason,
    };
  }
}
