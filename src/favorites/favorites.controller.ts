import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class CreateFavoriteDto {
  @IsOptional() @IsString() placeId?: string;
  @IsOptional() @IsString() guideId?: string;
  @IsOptional() @IsString() tourId?: string;
}

@ApiTags('Favorites')
@ApiBearerAuth('access-token')
@Controller('favorites')
@UseGuards(AuthGuard)
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'My saved items', description: 'Places, guides, and tours the user has bookmarked.' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Add to favorites',
    description: 'Provide exactly one of placeId, guideId, or tourId.',
  })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFavoriteDto,
  ) {
    const refs = [dto.placeId, dto.guideId, dto.tourId].filter(Boolean);
    if (refs.length !== 1) {
      throw new BadRequestException(
        'Provide exactly one of placeId, guideId, or tourId.',
      );
    }
    return this.prisma.favorite.create({
      data: { userId: user.id, ...dto },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove favorite' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const fav = await this.prisma.favorite.findUnique({ where: { id } });
    if (!fav) throw new NotFoundException('Favorite not found.');
    if (fav.userId !== user.id) {
      throw new ForbiddenException('That favorite belongs to someone else.');
    }
    await this.prisma.favorite.delete({ where: { id } });
    return { ok: true };
  }
}
