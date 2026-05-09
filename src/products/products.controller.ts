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

const PRODUCT_CATEGORIES = ['souvenir', 'apparel', 'art', 'food', 'beverage', 'rental'] as const;

class CreateProductDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]+$/) slug!: string;
  @IsString() @MinLength(2) title!: string;
  @IsString() @MinLength(10) description!: string;
  @IsIn(PRODUCT_CATEGORIES) category!: string;
  @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsString() badge?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsInt() inventory?: number;
}

class UpdateProductDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(PRODUCT_CATEGORIES) category?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsString() badge?: string;
  @IsOptional() @IsBoolean() inStock?: boolean;
  @IsOptional() @IsInt() inventory?: number;
}

@ApiTags('Public · Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse products',
    description: 'Souvenir + experience marketplace catalogue.',
  })
  @ApiQuery({ name: 'category', required: false, enum: [...PRODUCT_CATEGORIES] })
  @ApiQuery({ name: 'vendorId', required: false })
  list(
    @Query('category') category?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.prisma.product.findMany({
      where: {
        inStock: true,
        category: category || undefined,
        vendorId: vendorId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { slug: true, name: true } } },
    });
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get product detail' })
  async detail(@Param('slug') slug: string) {
    const p = await this.prisma.product.findUnique({
      where: { slug },
      include: { vendor: { select: { slug: true, name: true, city: true } } },
    });
    if (!p) throw new NotFoundException('Product not found.');
    return p;
  }
}

@ApiTags('Admin · Products')
@ApiBearerAuth('access-token')
@Controller('admin/products')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('products.read.admin')
  @ApiOperation({ summary: 'List all products (admin)' })
  list() {
    return this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { slug: true, name: true } } },
    });
  }

  @Post()
  @RequirePermissions('products.write')
  @ApiOperation({ summary: 'Create product' })
  create(@Body() dto: CreateProductDto) {
    return this.prisma.product.create({
      data: { ...dto, images: dto.images ?? [] },
    });
  }

  @Patch(':slug')
  @RequirePermissions('products.write')
  @ApiOperation({ summary: 'Update product' })
  async update(@Param('slug') slug: string, @Body() dto: UpdateProductDto) {
    const p = await this.prisma.product.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException('Product not found.');
    return this.prisma.product.update({ where: { slug }, data: dto });
  }

  @Delete(':slug')
  @RequirePermissions('products.write')
  @ApiOperation({ summary: 'Delete product' })
  async remove(@Param('slug') slug: string) {
    const p = await this.prisma.product.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException('Product not found.');
    await this.prisma.product.delete({ where: { slug } });
    return { ok: true };
  }
}
