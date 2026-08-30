import {
  Body,
  Controller,
  Delete,
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
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class CreateItineraryDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  coverImage?: string;
}

class UpdateItineraryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  coverImage?: string;
}

class AddItineraryItemDto {
  @IsInt()
  ordinal!: number;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/// Owner-scoped trip planner. Every route resolves through the caller's own
/// rows — no client-supplied itinerary belongs to anyone else.
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
      include: { items: { orderBy: { ordinal: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create an itinerary' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateItineraryDto) {
    return this.prisma.itinerary.create({
      data: {
        userId: user.id,
        title: dto.title,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isPublic: dto.isPublic ?? false,
        coverImage: dto.coverImage,
      },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one of my itineraries' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateItineraryDto,
  ) {
    await this.requireOwn(user, id);
    return this.prisma.itinerary.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isPublic: dto.isPublic,
        coverImage: dto.coverImage,
      },
      include: { items: { orderBy: { ordinal: 'asc' } } },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of my itineraries' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.requireOwn(user, id);
    await this.prisma.itinerary.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add an item to one of my itineraries' })
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddItineraryItemDto,
  ) {
    await this.requireOwn(user, id);
    return this.prisma.itineraryItem.create({
      data: {
        itineraryId: id,
        ordinal: dto.ordinal,
        placeId: dto.placeId,
        notes: dto.notes,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove an item from one of my itineraries' })
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    await this.requireOwn(user, id);
    const item = await this.prisma.itineraryItem.findFirst({
      where: { id: itemId, itineraryId: id },
    });
    if (!item) throw new NotFoundException(`Item '${itemId}' not found.`);
    await this.prisma.itineraryItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  private async requireOwn(user: AuthenticatedUser, id: string) {
    const itinerary = await this.prisma.itinerary.findFirst({
      where: { id, userId: user.id },
    });
    if (!itinerary) throw new NotFoundException(`Itinerary '${id}' not found.`);
    return itinerary;
  }
}
