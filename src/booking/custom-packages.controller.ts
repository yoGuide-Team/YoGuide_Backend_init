import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class CreateCustomPackageDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  tourIds!: string[];

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;
}

/// Tourists compose their own package out of individual catalog tours:
/// pick tour ids, and the package creates itself — price and duration are
/// derived server-side from the selected tours.
@ApiTags('Custom packages')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(AuthGuard)
export class CustomPackagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('packages/custom')
  @ApiOperation({ summary: 'Compose a custom package from selected tour ids' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomPackageDto) {
    const uniqueIds = [...new Set(dto.tourIds)];
    const tours = await this.prisma.packageTour.findMany({
      where: { id: { in: uniqueIds }, package: { isCustom: false } },
      include: { package: { select: { tourTypeId: true } } },
    });
    if (tours.length !== uniqueIds.length) {
      const found = new Set(tours.map((t) => t.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Tours not found in catalog: ${missing.join(', ')}`);
    }

    const price = tours.reduce((sum, t) => sum.add(t.price), new Prisma.Decimal(0));
    const durationHours = tours.reduce((sum, t) => sum + t.duration, 0);
    const name = dto.name ?? `Custom package (${tours.length} tours)`;
    const description =
      dto.description ?? `Custom itinerary: ${tours.map((t) => t.title).join(' · ')}`;

    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({
        data: {
          tourTypeId: tours[0].package.tourTypeId,
          name,
          description,
          durationHours,
          price,
          isCustom: true,
          createdById: user.id,
        },
      });
      await tx.packageTour.createMany({
        data: tours.map((t) => ({
          packageId: pkg.id,
          title: t.title,
          description: t.description,
          duration: t.duration,
          price: t.price,
        })),
      });
      return tx.package.findUniqueOrThrow({
        where: { id: pkg.id },
        include: { tours: true, tourType: { select: { id: true, name: true, regionId: true } } },
      });
    });
  }

  @Get('me/packages')
  @ApiOperation({ summary: 'List my custom packages' })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.package.findMany({
      where: { isCustom: true, createdById: user.id },
      orderBy: { createdAt: 'desc' },
      include: { tours: true, tourType: { select: { id: true, name: true, regionId: true } } },
    });
  }
}
