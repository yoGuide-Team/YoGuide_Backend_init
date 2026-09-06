import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApplicationStatus, GuideType, Language } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AdminRoleGuard } from '../admin/guards/admin-role.guard';
import { AccountProvisioningService } from './account-provisioning.service';

class ApplyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsEnum(GuideType)
  guideType!: GuideType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Language, { each: true })
  languages?: Language[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentUrls?: string[];

  @IsOptional()
  @IsBoolean()
  wantsGastronomy?: boolean;
}

class RejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/// Public application intake. Deliberately unauthenticated — an applicant
/// has no account until an admin approves them, which is the whole point of
/// the flow. Mirrors the existing POST /hotel/apply.
@ApiTags('Provider applications')
@Controller('guide')
export class GuideApplyController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('apply')
  @ApiOperation({
    summary: 'Apply to become a guide, tour company, or gastronomy provider',
    description:
      'Creates a PENDING application for admin review. No account is created here — ' +
      'approval provisions the account and emails a single-use activation link.',
  })
  async apply(@Body() dto: ApplyDto) {
    const email = dto.email.trim().toLowerCase();

    if (dto.guideType === GuideType.COMPANY && !dto.companyName) {
      throw new BadRequestException('companyName is required for COMPANY applications.');
    }

    const pending = await this.prisma.guideApplication.findFirst({
      where: { email, status: ApplicationStatus.PENDING },
    });
    if (pending) {
      // Not an error the applicant needs to act on — report the existing
      // application rather than creating a duplicate queue entry.
      return {
        id: pending.id,
        status: pending.status,
        message: 'You already have an application under review.',
      };
    }

    const alreadyApproved = await this.prisma.guideApplication.findFirst({
      where: { email, status: ApplicationStatus.APPROVED },
    });
    if (alreadyApproved) {
      throw new BadRequestException(
        'An approved provider account already exists for this email. Sign in, or use "Forgot password".',
      );
    }

    const application = await this.prisma.guideApplication.create({
      data: {
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone,
        nationality: dto.nationality,
        guideType: dto.guideType,
        companyName: dto.companyName,
        city: dto.city,
        bio: dto.bio,
        languages: dto.languages ?? [],
        documentUrls: dto.documentUrls ?? [],
        wantsGastronomy: dto.wantsGastronomy ?? false,
      },
    });

    return {
      id: application.id,
      status: application.status,
      message: 'Application received. We will email you when it has been reviewed.',
    };
  }
}

/// Admin review queue for provider applications.
@ApiTags('Admin · Provider applications')
@ApiBearerAuth('access-token')
@Controller('admin/guide-applications')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminGuideApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: AccountProvisioningService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List provider applications' })
  @ApiQuery({ name: 'status', required: false, enum: ApplicationStatus })
  list(@Query('status') status?: ApplicationStatus) {
    return this.prisma.guideApplication.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedBy: { select: { id: true, fullName: true, email: true } },
        createdUser: { select: { id: true, email: true, mustSetPassword: true } },
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one application' })
  async get(@Param('id') id: string) {
    const application = await this.prisma.guideApplication.findUnique({
      where: { id },
      include: {
        reviewedBy: { select: { id: true, fullName: true, email: true } },
        createdUser: { select: { id: true, email: true, mustSetPassword: true } },
        guide: true,
      },
    });
    if (!application) throw new NotFoundException(`Application '${id}' not found.`);
    return application;
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve an application and provision the provider account',
    description:
      'Creates (or promotes) the user, creates the GuideProfile — and a ChefProfile ' +
      'for gastronomy applicants — marks the provider verified, and emails a ' +
      'single-use activation link. No password is ever generated or emailed.',
  })
  async approve(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    const application = await this.prisma.guideApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException(`Application '${id}' not found.`);
    if (application.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException('This application is already approved.');
    }

    const result = await this.provisioning.provisionForApplication(id, admin.id);
    return {
      ok: true,
      applicationId: id,
      userId: result.userId,
      guideId: result.guideId,
      activationEmail: result.emailStatus,
    };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject an application' })
  async reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDto,
  ) {
    const application = await this.prisma.guideApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException(`Application '${id}' not found.`);
    if (application.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException('An approved application cannot be rejected.');
    }
    return this.provisioning.reject(id, admin.id, dto.reason);
  }
}
