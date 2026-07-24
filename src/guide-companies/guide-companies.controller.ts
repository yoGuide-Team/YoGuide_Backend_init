import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AuditLogService } from '../audit/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

// Same set AdminToursController's CreateTourDto validates against
// (src/tours/tours.controller.ts) — packages created here are plain Tour
// rows, so they must satisfy the same constraint.
const PACKAGE_VEHICLE_TYPES = ['motorbike', 'ev_car', 'walking', 'minivan'] as const;

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'company'
  );
}

class ApplyGuideCompanyDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() city?: string;
}

/** Self-service edit — no status/rejectionReason, those stay admin-only via verify/reject. */
class UpdateMyGuideCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() city?: string;
}

class RejectDto {
  @IsString() @MinLength(3) reason!: string;
}

class UpsertVehicleDto {
  @IsString() @MinLength(2) type!: string;
  @IsString() @MinLength(2) label!: string;
  @IsOptional() @IsString() plateNumber?: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpsertPackageDto {
  @IsString() @MinLength(3) title!: string;
  @IsString() @MinLength(10) description!: string;
  @IsIn(PACKAGE_VEHICLE_TYPES) vehicleType!: string;
  @IsInt() @Min(15) durationMinutes!: number;
  @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() cityId?: string;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

class CreateCompanyGuideDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) specialties?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(60) yearsExperience?: number;
  @IsOptional() @IsString() city?: string;
}

class UpdateCompanyGuideDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) specialties?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(60) yearsExperience?: number;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
}

@ApiTags('Public · Guide Companies')
@Controller('guide-companies')
export class GuideCompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Browse guide companies', description: 'Approved companies only.' })
  @ApiQuery({ name: 'city', required: false })
  async list(@Query('city') city?: string) {
    return this.prisma.guideCompany.findMany({
      where: {
        status: 'approved',
        city: city ? { equals: city, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Self-service (the signed-in user's own company) ──────────────────────
  // Registered before ':slug' so 'me' isn't swallowed by that wildcard route.

  @Post('apply')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply to register a guide company',
    description:
      "Creates a pending GuideCompany linked to the signed-in user's account (one per account). If a prior application was rejected, resubmitting here updates it in place instead of erroring. An admin must verify it (POST /admin/guide-companies/:id/verify) before the company dashboard becomes reachable — verifying also promotes the user's role to `guide_company`.",
  })
  async apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyGuideCompanyDto) {
    const existing = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (existing) {
      if (existing.status !== 'rejected') {
        throw new BadRequestException('You already have a guide company application on file.');
      }
      return this.prisma.guideCompany.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          description: dto.description,
          contact: dto.contact,
          email: dto.email,
          phone: dto.phone,
          website: dto.website,
          city: dto.city,
          status: 'pending',
          rejectionReason: null,
        },
      });
    }
    let slug = slugify(dto.name);
    if (await this.prisma.guideCompany.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return this.prisma.guideCompany.create({
      data: {
        ownerId: user.id,
        slug,
        name: dto.name,
        description: dto.description,
        contact: dto.contact,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        city: dto.city,
        status: 'pending',
      },
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Signed-in user's own guide company profile" })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.prisma.guideCompany.findUnique({
      where: { ownerId: user.id },
      include: { guides: true, vehicles: true },
    });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    return company;
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own company profile (not status/verification — admin-only)' })
  async updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyGuideCompanyDto) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    return this.prisma.guideCompany.update({ where: { id: company.id }, data: dto });
  }

  @Get('me/bookings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bookings for the company',
    description:
      "Two paths in: package bookings (booking.tour.companyId) and a company-employed guide's direct bookings (booking.guide.companyId) — there is no single Booking.companyId column.",
  })
  async myBookings(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    return this.prisma.booking.findMany({
      where: { OR: [{ tour: { companyId: company.id } }, { guide: { companyId: company.id } }] },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, fullName: true } },
        tour: { select: { title: true } },
        guide: { select: { fullName: true } },
      },
    });
  }

  @Get('me/stats')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Company stats',
    description:
      'Live-aggregated counts + settled revenue scoped to this company, same style as GET /admin/stats — not the AnalyticsEvent ingest pipeline, which stays out of scope.',
  })
  async myStats(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    const [guideCount, vehicleCount, packageCount, bookings] = await Promise.all([
      this.prisma.guide.count({ where: { companyId: company.id } }),
      this.prisma.vehicle.count({ where: { companyId: company.id } }),
      this.prisma.tour.count({ where: { companyId: company.id } }),
      this.prisma.booking.findMany({
        where: { OR: [{ tour: { companyId: company.id } }, { guide: { companyId: company.id } }] },
        select: { status: true, totalCents: true },
      }),
    ]);
    const bookingsByStatus: Record<string, number> = {};
    let settledRevenueCents = 0;
    for (const b of bookings) {
      bookingsByStatus[b.status] = (bookingsByStatus[b.status] ?? 0) + 1;
      if (b.status === 'completed') settledRevenueCents += b.totalCents;
    }
    return {
      guideCount,
      vehicleCount,
      packageCount,
      bookingCount: bookings.length,
      bookingsByStatus,
      settledRevenueCents,
      currency: 'USD',
    };
  }

  // ── Guides ─────────────────────────────────────────────────────────────

  @Get('me/guides')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Guides employed by the signed-in user\'s company' })
  async myGuides(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    return this.prisma.guide.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' } });
  }

  @Post('me/guides')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a company-employed guide',
    description:
      'Creates a Guide with no personal login (userId stays null) under the signed-in user\'s company. Trusted immediately (isVerified/status=approved) since the company itself is already admin-approved.',
  })
  async addMyGuide(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCompanyGuideDto) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    if (company.status !== 'approved') {
      throw new ForbiddenException('Your guide company must be approved before you can add guides.');
    }
    return this.prisma.guide.create({
      data: {
        companyId: company.id,
        fullName: dto.fullName,
        emoji: dto.emoji,
        bio: dto.bio,
        specialties: dto.specialties ?? [],
        languages: dto.languages ?? [],
        yearsExperience: dto.yearsExperience ?? 0,
        city: dto.city,
        isVerified: true,
        status: 'approved',
      },
    });
  }

  @Patch('me/guides/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a company guide — must belong to the signed-in user's company" })
  async updateMyGuide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyGuideDto,
  ) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    const guide = await this.prisma.guide.findUnique({ where: { id } });
    if (!guide || guide.companyId !== company.id) {
      throw new NotFoundException('Guide not found on your company.');
    }
    return this.prisma.guide.update({ where: { id }, data: dto });
  }

  @Delete('me/guides/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove a company guide — must belong to the signed-in user's company" })
  async removeMyGuide(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    const guide = await this.prisma.guide.findUnique({ where: { id } });
    if (!guide || guide.companyId !== company.id) {
      throw new NotFoundException('Guide not found on your company.');
    }
    await this.prisma.guide.delete({ where: { id } });
    return { ok: true };
  }

  // ── Vehicles ───────────────────────────────────────────────────────────

  @Get('me/vehicles')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Vehicles under the signed-in user's company" })
  async myVehicles(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    return this.prisma.vehicle.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' } });
  }

  @Post('me/vehicles')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add a vehicle under the signed-in user's company" })
  async createMyVehicle(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertVehicleDto) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    return this.prisma.vehicle.create({ data: { companyId: company.id, ...dto } });
  }

  @Patch('me/vehicles/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a vehicle — must belong to the signed-in user's company" })
  async updateMyVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertVehicleDto>,
  ) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle || vehicle.companyId !== company.id) {
      throw new NotFoundException('Vehicle not found on your company.');
    }
    return this.prisma.vehicle.update({ where: { id }, data: dto });
  }

  @Delete('me/vehicles/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a vehicle — must belong to the signed-in user's company" })
  async deleteMyVehicle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle || vehicle.companyId !== company.id) {
      throw new NotFoundException('Vehicle not found on your company.');
    }
    await this.prisma.vehicle.delete({ where: { id } });
    return { ok: true };
  }

  // ── Packages (Tours) ──────────────────────────────────────────────────

  @Get('me/packages')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Packages (Tours) owned by the signed-in user's company" })
  async myPackages(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    return this.prisma.tour.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      include: { stops: { orderBy: { ordinal: 'asc' } } },
    });
  }

  @Post('me/packages')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a package under the signed-in user\'s company (requires an approved company)' })
  async createMyPackage(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPackageDto) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    if (company.status !== 'approved') {
      throw new ForbiddenException('Your guide company must be approved before you can publish packages.');
    }
    return this.prisma.tour.create({
      data: { ...dto, companyId: company.id, highlights: dto.highlights ?? [] },
      include: { stops: true },
    });
  }

  @Patch('me/packages/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a package — must belong to the signed-in user's company" })
  async updateMyPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertPackageDto>,
  ) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    const tour = await this.prisma.tour.findUnique({ where: { id } });
    if (!tour || tour.companyId !== company.id) {
      throw new NotFoundException('Package not found on your company.');
    }
    return this.prisma.tour.update({ where: { id }, data: dto });
  }

  @Delete('me/packages/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a package — must belong to the signed-in user's company" })
  async deleteMyPackage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const company = await this.prisma.guideCompany.findUnique({ where: { ownerId: user.id } });
    if (!company) throw new NotFoundException('No guide company application found for this account.');
    const tour = await this.prisma.tour.findUnique({ where: { id } });
    if (!tour || tour.companyId !== company.id) {
      throw new NotFoundException('Package not found on your company.');
    }
    await this.prisma.tour.delete({ where: { id } });
    return { ok: true };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get guide company profile' })
  async detail(@Param('slug') slug: string) {
    const c = await this.prisma.guideCompany.findUnique({
      where: { slug },
      include: { guides: true, vehicles: true },
    });
    if (!c || c.status !== 'approved') throw new NotFoundException('Guide company not found.');
    return c;
  }
}

@ApiTags('Admin · Guide Companies')
@ApiBearerAuth('access-token')
@Controller('admin/guide-companies')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminGuideCompaniesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  @Get()
  @RequirePermissions('guide_companies.read')
  @ApiOperation({ summary: 'List all guide companies (admin)' })
  list() {
    return this.prisma.guideCompany.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Get(':id')
  @RequirePermissions('guide_companies.read')
  @ApiOperation({ summary: 'Get guide company (admin)' })
  async detail(@Param('id') id: string) {
    const c = await this.prisma.guideCompany.findUnique({
      where: { id },
      include: { guides: true, vehicles: true, packages: true },
    });
    if (!c) throw new NotFoundException('Guide company not found.');
    return c;
  }

  @Post(':id/verify')
  @RequirePermissions('guide_companies.write')
  @ApiOperation({
    summary: 'Approve guide company',
    description:
      "If linked to a user account, also promotes that user's role to `guide_company` so the company dashboard becomes reachable for them.",
  })
  async verify(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    const c = await this.prisma.guideCompany.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Guide company not found.');
    const updated = await this.prisma.guideCompany.update({
      where: { id },
      data: { status: 'approved', rejectionReason: null },
    });
    if (c.ownerId) {
      await this.prisma.user.update({ where: { id: c.ownerId }, data: { roleKey: 'guide_company' } });
      const owner = await this.prisma.user.findUnique({ where: { id: c.ownerId } });
      if (owner) {
        await this.notifications.notifyVerificationApproved(owner.id, 'guide company');
        await this.mail.sendApplicationStatusEmail(owner.email, owner.fullName ?? 'there', 'guide company', 'approved');
      }
    }
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'guide_company.verify',
      entity: 'GuideCompany',
      entityId: id,
    });
    return updated;
  }

  @Post(':id/reject')
  @RequirePermissions('guide_companies.write')
  @ApiOperation({ summary: 'Reject guide company application with a reason' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const c = await this.prisma.guideCompany.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Guide company not found.');
    const updated = await this.prisma.guideCompany.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: dto.reason },
    });
    if (c.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: c.ownerId } });
      if (owner) {
        await this.notifications.notifyVerificationRejected(owner.id, 'guide company', dto.reason);
        await this.mail.sendApplicationStatusEmail(owner.email, owner.fullName ?? 'there', 'guide company', 'rejected', dto.reason);
      }
    }
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'guide_company.reject',
      entity: 'GuideCompany',
      entityId: id,
      metadata: { reason: dto.reason },
    });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('guide_companies.write')
  @ApiOperation({ summary: 'Delete guide company' })
  async remove(@Param('id') id: string) {
    const c = await this.prisma.guideCompany.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Guide company not found.');
    await this.prisma.guideCompany.delete({ where: { id } });
    return { ok: true };
  }
}
