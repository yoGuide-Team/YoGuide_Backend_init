import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class CreateItineraryDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsString() coverImage?: string;
}

class UpdateItineraryDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsString() coverImage?: string;
}

class AddItemDto {
  @IsInt() @Min(1) ordinal!: number;
  @IsOptional() @IsString() placeId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

@ApiTags('Itineraries')
@ApiBearerAuth('access-token')
@Controller('itineraries')
@UseGuards(AuthGuard)
export class ItinerariesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'My itineraries' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.itinerary.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { items: { orderBy: { ordinal: 'asc' } } },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create itinerary' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateItineraryDto,
  ) {
    return this.prisma.itinerary.create({
      data: {
        userId: user.id,
        title: dto.title,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isPublic: dto.isPublic ?? false,
        coverImage: dto.coverImage,
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get itinerary detail' })
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const it = await this.prisma.itinerary.findUnique({
      where: { id },
      include: { items: { orderBy: { ordinal: 'asc' } } },
    });
    if (!it) throw new NotFoundException('Itinerary not found.');
    if (it.userId !== user.id && !it.isPublic) {
      throw new ForbiddenException('That itinerary is private.');
    }
    return it;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update itinerary' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateItineraryDto,
  ) {
    const it = await this.prisma.itinerary.findUnique({ where: { id } });
    if (!it) throw new NotFoundException('Itinerary not found.');
    if (it.userId !== user.id) {
      throw new ForbiddenException("That isn't your itinerary.");
    }
    return this.prisma.itinerary.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isPublic: dto.isPublic ?? undefined,
        coverImage: dto.coverImage ?? undefined,
      },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete itinerary' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const it = await this.prisma.itinerary.findUnique({ where: { id } });
    if (!it) throw new NotFoundException('Itinerary not found.');
    if (it.userId !== user.id) {
      throw new ForbiddenException("That isn't your itinerary.");
    }
    await this.prisma.itinerary.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add a stop to the itinerary' })
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddItemDto,
  ) {
    const it = await this.prisma.itinerary.findUnique({ where: { id } });
    if (!it) throw new NotFoundException('Itinerary not found.');
    if (it.userId !== user.id) {
      throw new ForbiddenException("That isn't your itinerary.");
    }
    return this.prisma.itineraryItem.create({
      data: {
        itineraryId: id,
        ordinal: dto.ordinal,
        placeId: dto.placeId,
        notes: dto.notes,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });
  }

  @Delete(':itineraryId/items/:itemId')
  @ApiOperation({ summary: 'Remove a stop from the itinerary' })
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itineraryId') itineraryId: string,
    @Param('itemId') itemId: string,
  ) {
    const it = await this.prisma.itinerary.findUnique({ where: { id: itineraryId } });
    if (!it) throw new NotFoundException('Itinerary not found.');
    if (it.userId !== user.id) {
      throw new ForbiddenException("That isn't your itinerary.");
    }
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.itineraryId !== itineraryId) {
      throw new NotFoundException('Item not found on that itinerary.');
    }
    await this.prisma.itineraryItem.delete({ where: { id: itemId } });
    return { ok: true };
  }
}
