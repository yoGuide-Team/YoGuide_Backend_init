import {
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
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

const VENDOR_CATEGORIES = ['hotel', 'restaurant', 'shop', 'operator', 'transport'] as const;

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
  @IsOptional() @IsBoolean() isVerified?: boolean;
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
  list(
    @Query('category') category?: string,
    @Query('city') city?: string,
  ) {
    return this.prisma.vendor.findMany({
      where: {
        isActive: true,
        isVerified: true,
        category: category || undefined,
        city: city || undefined,
      },
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
    });
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get vendor profile' })
  async detail(@Param('slug') slug: string) {
    const v = await this.prisma.vendor.findUnique({
      where: { slug },
      include: { products: { where: { inStock: true } } },
    });
    if (!v) throw new NotFoundException('Vendor not found.');
    return v;
  }
}

@ApiTags('Admin · Vendors')
@ApiBearerAuth('access-token')
@Controller('admin/vendors')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminVendorsController {
  constructor(private readonly prisma: PrismaService) {}

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
  @ApiOperation({ summary: 'Mark vendor as verified' })
  async verify(@Param('slug') slug: string) {
    const v = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!v) throw new NotFoundException('Vendor not found.');
    return this.prisma.vendor.update({
      where: { slug },
      data: { isVerified: true },
    });
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
