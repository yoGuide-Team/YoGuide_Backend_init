import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ApiErrorResponse, AuthUserResponse } from '../common/responses';
import { PrismaService } from '../prisma/prisma.service';

class SubmitIdentityVerificationDto {
  /** Doc URL(s) — reuses the existing POST /files/sign-upload stub for the
   * actual file; this just records the resulting URL(s). */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  docUrls!: string[];
}

@ApiTags('Account')
@ApiBearerAuth('access-token')
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Current user',
    description:
      "Returns the user record for the bearer token, including the materialised permission set computed from the user's role on this request. Re-fetched from DB on every call, so role/permission changes take effect immediately without a token refresh.",
  })
  @ApiOkResponse({
    description: "Current user, with permissions resolved at this moment.",
    type: AuthUserResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, malformed, or expired bearer token.',
    type: ApiErrorResponse,
  })
  whoAmI(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('identity-verification')
  @ApiOperation({
    summary: 'My identity verification status',
    description:
      "Admin-approved KYC gate for yoEcoPay/Wallet — separate from email verification. See POST /wallet/topup, which requires identityStatus === 'approved'.",
  })
  async myIdentityVerification(@CurrentUser() user: AuthenticatedUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { identityStatus: true, identityDocUrls: true, identityRejectionReason: true },
    });
    return row;
  }

  @Post('identity-verification')
  @ApiOperation({
    summary: 'Submit identity documents for admin review',
    description:
      "Records the submitted doc URL(s) and sets identityStatus to 'pending'. Rejects if a submission is already pending or already approved — a rejected submission may resubmit.",
  })
  async submitIdentityVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitIdentityVerificationDto,
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { identityStatus: true },
    });
    if (current?.identityStatus === 'pending' || current?.identityStatus === 'approved') {
      throw new BadRequestException(
        `Identity verification is already ${current.identityStatus}.`,
      );
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        identityDocUrls: dto.docUrls,
        identityStatus: 'pending',
        identityRejectionReason: null,
      },
      select: { identityStatus: true, identityDocUrls: true, identityRejectionReason: true },
    });
  }
}
