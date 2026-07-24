import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  Matches,
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

const VENDOR_CATEGORIES = ['hotel', 'restaurant', 'shop', 'operator', 'transport'] as const;
// Deliberately excludes 'pending' (initial, system-set) and 'refunded'
// (wallet-transaction-linked, stays admin/force-refund-only) — matches
// BookingsService's real VALID_STATUSES set.
const HOTEL_MANAGEABLE_STATUSES = ['confirmed', 'completed', 'cancelled'] as const;

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'vendor';
}

class CreateVendorDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]+$/) slug!: string;
  @IsString() @MinLength(2) name!: string;
  @IsIn(VENDOR_CATEGORIES) category!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() city?: string;
}

/** isVerified/status/rejectionReason are deliberately absent — routing every
 * verification-state change exclusively through verify()/reject() avoids a
 * second, silent way to desync isVerified from status. */
class UpdateVendorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(VENDOR_CATEGORIES) category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class RejectVendorDto {
  @IsString() @MinLength(3) reason!: string;
}

class UpdateBookingStatusDto {
  @IsIn(HOTEL_MANAGEABLE_STATUSES) status!: string;
}

class ApplyVendorDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsString() checkInTime?: string;
  @IsOptional() @IsString() checkOutTime?: string;
}

/** Self-service edit — no category/isVerified/isActive, those stay admin-only. */
class UpdateMyVendorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsString() checkInTime?: string;
  @IsOptional() @IsString() checkOutTime?: string;
}

/** Room type — modeled as a Product (vendorId, title, priceCents, images, inventory)
 *  scoped to the owner's own vendor, same model the admin/products CRUD already uses. */
class UpsertRoomTypeDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsInt() @Min(0) inventory?: number;
  @IsOptional() @IsBoolean() inStock?: boolean;
}

@ApiTags('Public · Vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse vendors',
    description: 'Hotels, shops, operators, transport. Verified + active vendors only.',
  })
  @ApiQuery({ name: 'category', required: false, enum: [...VENDOR_CATEGORIES] })
  @ApiQuery({ name: 'city', required: false })
  async list(
    @Query('category') category?: string,
    @Query('city') city?: string,
  ) {
    const vendors = await this.prisma.vendor.findMany({
      where: {
        isActive: true,
        isVerified: true,
        category: category || undefined,
        // Case-insensitive: frontend city stores/params are lowercase
        // ('musanze'), seeded/self-registered vendor data is capitalized
        // ('Musanze') — matching exact case here silently returned zero
        // results.
        city: city ? { equals: city, mode: 'insensitive' } : undefined,
      },
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
      include: {
        products: {
          where: { inStock: true },
          orderBy: { priceCents: 'asc' },
          take: 1,
          select: { priceCents: true, currency: true },
        },
        reviews: { where: { status: 'approved' }, select: { id: true } },
      },
    });
    return vendors.map((v) => this.enrich(v));
  }

  // ── Self-service (the signed-in user's own vendor) ──────────────────────
  // Registered before ':slug' so 'me' isn't swallowed by that wildcard route.

  @Post('apply')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply to register a hotel',
    description:
      "Creates an unverified Vendor (category 'hotel') linked to the signed-in user's account (one per account). An admin must verify it (POST /admin/vendors/:slug/verify) before it's discoverable and before the hotel dashboard becomes reachable — verifying also promotes the user's role to `hotel_manager`.",
  })
  async apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyVendorDto) {
    const existing = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (existing) {
      if (existing.status !== 'rejected') {
        throw new BadRequestException('You already have a vendor application on file.');
      }
      // Resubmission after rejection — update in place instead of erroring.
      return this.prisma.vendor.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          description: dto.description,
          contact: dto.contact,
          email: dto.email,
          phone: dto.phone,
          website: dto.website,
          city: dto.city,
          address: dto.address,
          amenities: dto.amenities ?? [],
          checkInTime: dto.checkInTime,
          checkOutTime: dto.checkOutTime,
          status: 'pending',
          rejectionReason: null,
          isVerified: false,
        },
      });
    }
    let slug = slugify(dto.name);
    if (await this.prisma.vendor.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return this.prisma.vendor.create({
      data: {
        ownerId: user.id,
        slug,
        name: dto.name,
        category: 'hotel',
        description: dto.description,
        contact: dto.contact,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        city: dto.city,
        address: dto.address,
        amenities: dto.amenities ?? [],
        checkInTime: dto.checkInTime,
        checkOutTime: dto.checkOutTime,
        isVerified: false,
        status: 'pending',
      },
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Signed-in user's own vendor profile" })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerId: user.id },
      include: { products: true },
    });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    return vendor;
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own vendor profile (not category/verification — admin-only)' })
  async updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyVendorDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    return this.prisma.vendor.update({ where: { id: vendor.id }, data: dto });
  }

  @Get('me/bookings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Bookings assigned to the signed-in user's vendor" })
  async myBookings(@CurrentUser() user: AuthenticatedUser) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    return this.prisma.booking.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, fullName: true } } },
    });
  }

  @Patch('me/bookings/:id/status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a booking status — hotel-manager subset',
    description: `Restricted to ${HOTEL_MANAGEABLE_STATUSES.join(' | ')}. Must belong to the signed-in user's vendor. 'pending' (system-set) and 'refunded' (wallet-linked) stay out of hotel-manager reach — use the admin endpoint for those.`,
  })
  async updateMyBookingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking || booking.vendorId !== vendor.id) {
      throw new NotFoundException('Booking not found on your vendor.');
    }
    return this.prisma.booking.update({ where: { id }, data: { status: dto.status } });
  }

  @Get('me/products')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Room types (Products) under the signed-in user's vendor" })
  async myProducts(@CurrentUser() user: AuthenticatedUser) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    return this.prisma.product.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: 'desc' } });
  }

  @Post('me/products')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a room type under the signed-in user\'s vendor' })
  async createMyProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertRoomTypeDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    let slug = slugify(`${vendor.slug}-${dto.title}`);
    if (await this.prisma.product.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return this.prisma.product.create({
      data: {
        vendorId: vendor.id,
        slug,
        title: dto.title,
        description: dto.description ?? '',
        category: 'room',
        priceCents: dto.priceCents,
        currency: dto.currency ?? 'USD',
        images: dto.images ?? [],
        inventory: dto.inventory,
        inStock: dto.inStock ?? true,
      },
    });
  }

  @Patch('me/products/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a room type — must belong to the signed-in user's vendor" })
  async updateMyProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertRoomTypeDto>,
  ) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.vendorId !== vendor.id) {
      throw new NotFoundException('Room type not found on your vendor.');
    }
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  @Delete('me/products/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a room type — must belong to the signed-in user's vendor" })
  async deleteMyProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id } });
    if (!vendor) throw new NotFoundException('No vendor application found for this account.');
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.vendorId !== vendor.id) {
      throw new NotFoundException('Room type not found on your vendor.');
    }
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get vendor profile' })
  async detail(@Param('slug') slug: string) {
    const v = await this.prisma.vendor.findUnique({
      where: { slug },
      include: {
        products: { where: { inStock: true } },
        reviews: { where: { status: 'approved' }, select: { id: true } },
      },
    });
    if (!v) throw new NotFoundException('Vendor not found.');
    return this.enrich(v);
  }

  /** Adds computed pricePerNightUsd (cheapest in-stock room) + reviewCount, matching the tourist-facing Hotel type's expectations — neither is a stored column. */
  private enrich<T extends { products?: { priceCents: number; currency: string }[]; reviews?: { id: string }[] }>(
    v: T,
  ) {
    const cheapest = v.products?.[0];
    const pricePerNightUsd = cheapest ? cheapest.priceCents / 100 : null;
    const reviewCount = v.reviews?.length ?? 0;
    const { reviews: _reviews, ...rest } = v;
    return { ...rest, pricePerNightUsd, reviewCount };
  }
}

@ApiTags('Admin · Vendors')
@ApiBearerAuth('access-token')
@Controller('admin/vendors')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminVendorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  @Get()
  @RequirePermissions('vendors.read')
  @ApiOperation({ summary: 'List all vendors (admin)' })
  list() {
    return this.prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post()
  @RequirePermissions('vendors.write')
  @ApiOperation({ summary: 'Onboard vendor' })
  create(@Body() dto: CreateVendorDto) {
    return this.prisma.vendor.create({ data: dto });
  }

  @Patch(':slug')
  @RequirePermissions('vendors.write')
  @ApiOperation({ summary: 'Update vendor' })
  async update(@Param('slug') slug: string, @Body() dto: UpdateVendorDto) {
    const v = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!v) throw new NotFoundException('Vendor not found.');
    return this.prisma.vendor.update({ where: { slug }, data: dto });
  }

  @Post(':slug/verify')
  @RequirePermissions('vendors.write')
  @ApiOperation({
    summary: 'Mark vendor as verified',
    description:
      "If the vendor is linked to a user account (self-applied via POST /vendors/apply), also promotes that user's role to `hotel_manager` so /hotel-owner becomes reachable for them.",
  })
  async verify(@Param('slug') slug: string, @CurrentUser() actor: AuthenticatedUser) {
    const v = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!v) throw new NotFoundException('Vendor not found.');
    const updated = await this.prisma.vendor.update({
      where: { slug },
      data: { isVerified: true, status: 'approved', rejectionReason: null },
    });
    if (v.ownerId) {
      await this.prisma.user.update({
        where: { id: v.ownerId },
        data: { roleKey: 'hotel_manager' },
      });
      const owner = await this.prisma.user.findUnique({ where: { id: v.ownerId } });
      if (owner) {
        await this.notifications.notifyVerificationApproved(owner.id, 'hotel');
        await this.mail.sendApplicationStatusEmail(owner.email, owner.fullName ?? 'there', 'hotel', 'approved');
      }
    }
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'vendor.verify',
      entity: 'Vendor',
      entityId: v.id,
    });
    return updated;
  }

  @Post(':slug/reject')
  @RequirePermissions('vendors.write')
  @ApiOperation({ summary: 'Reject vendor application with a reason' })
  async reject(
    @Param('slug') slug: string,
    @Body() dto: RejectVendorDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const v = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!v) throw new NotFoundException('Vendor not found.');
    const updated = await this.prisma.vendor.update({
      where: { slug },
      data: { isVerified: false, status: 'rejected', rejectionReason: dto.reason },
    });
    if (v.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: v.ownerId } });
      if (owner) {
        await this.notifications.notifyVerificationRejected(owner.id, 'hotel', dto.reason);
        await this.mail.sendApplicationStatusEmail(owner.email, owner.fullName ?? 'there', 'hotel', 'rejected', dto.reason);
      }
    }
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'vendor.reject',
      entity: 'Vendor',
      entityId: v.id,
      metadata: { reason: dto.reason },
    });
    return updated;
  }

  @Delete(':slug')
  @RequirePermissions('vendors.write')
  @ApiOperation({ summary: 'Delete vendor' })
  async remove(@Param('slug') slug: string) {
    const v = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!v) throw new NotFoundException('Vendor not found.');
    await this.prisma.vendor.delete({ where: { slug } });
    return { ok: true };
  }
}
