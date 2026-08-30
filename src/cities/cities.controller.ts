import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/// Public city-events directory backing the onboarding "what's on" step.
/// No seed data — an unknown or event-less city legitimately returns [],
/// same convention as the hotels feature's placeholder-free approach.
@ApiTags('Cities')
@Controller('cities')
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':slug/events')
  @ApiOperation({ summary: "Upcoming events in a city" })
  async events(@Param('slug') slug: string) {
    const city = await this.prisma.city.findUnique({ where: { slug } });
    if (!city) return [];
    return this.prisma.event.findMany({
      where: { cityId: city.id },
      orderBy: { startsAt: 'asc' },
    });
  }
}
