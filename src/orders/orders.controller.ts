import {
  BadRequestException,
  Body,
  Controller,
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
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class OrderLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
}

class PlaceOrderDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OrderLineDto)
  items!: OrderLineDto[];

  @IsOptional() @IsIn(['hotel_delivery', 'airport_pickup', 'self_pickup'])
  shippingType?: string;

  @IsOptional() @IsString()
  shippingNote?: string;
}

class UpdateOrderStatusDto {
  @IsIn(['placed', 'paid', 'shipped', 'delivered', 'cancelled'])
  status!: string;
}

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({
    summary: 'Place an order',
    description:
      'Resolves each line to its product, locks current price into the order, returns the saved order with totals.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PlaceOrderDto,
  ) {
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products do not exist.');
    }
    const productById = new Map(products.map((p) => [p.id, p]));
    const currency = products[0].currency;
    let total = 0;
    const lineCreates = dto.items.map((line) => {
      const p = productById.get(line.productId)!;
      total += p.priceCents * line.quantity;
      return {
        productId: p.id,
        quantity: line.quantity,
        priceCents: p.priceCents,
        currency: p.currency,
      };
    });
    const order = await this.prisma.order.create({
      data: {
        userId: user.id,
        totalCents: total,
        currency,
        shippingType: dto.shippingType,
        shippingNote: dto.shippingNote,
        items: { create: lineCreates },
      },
      include: { items: { include: { product: { select: { title: true, slug: true } } } } },
    });
    return order;
  }

  @Get()
  @ApiOperation({ summary: 'My orders' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } } },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Order detail' })
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.userId !== user.id) {
      throw new ForbiddenException("That isn't your order.");
    }
    return order;
  }
}

@ApiTags('Admin · Orders')
@ApiBearerAuth('access-token')
@Controller('admin/orders')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'List all orders' })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('status') status?: string) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        items: { include: { product: { select: { title: true, slug: true } } } },
      },
    });
  }

  @Patch(':id/status')
  @RequirePermissions('orders.write')
  @ApiOperation({ summary: 'Update order status' })
  async setStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('Order not found.');
    return this.prisma.order.update({
      where: { id },
      data: { status: dto.status },
    });
  }
}
