import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class AnalyticsEventDto {
  @IsString() name!: string;
  @IsOptional() @IsObject() properties?: Record<string, unknown>;
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}

class AnalyticsBatchDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AnalyticsEventDto)
  events!: AnalyticsEventDto[];
}

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('events')
  @ApiOperation({
    summary: 'Ingest a batch of client events',
    description:
      'Append-only ingest. Up to 100 events per call. Aggregations live in a separate pipeline (out of scope here).',
  })
  async ingest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyticsBatchDto,
  ) {
    const data = dto.events.map((e) => ({
      userId: user.id,
      sessionId: e.sessionId ?? null,
      name: e.name,
      properties: (e.properties ?? {}) as object,
      occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
    }));
    const result = await this.prisma.analyticsEvent.createMany({ data });
    return { ingested: result.count };
  }
}

@ApiTags('Admin · Analytics')
@ApiBearerAuth('access-token')
@Controller('admin/analytics')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('events')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Recent analytics events', description: 'Up to 200 most recent. Filter by event name.' })
  @ApiQuery({ name: 'name', required: false })
  list(@Query('name') name?: string) {
    return this.prisma.analyticsEvent.findMany({
      where: name ? { name } : undefined,
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
  }

  @Get('top-events')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Top event names by volume (last 7 days)' })
  async top() {
    const since = new Date(Date.now() - 7 * 86400000);
    const rows = await this.prisma.analyticsEvent.groupBy({
      by: ['name'],
      where: { occurredAt: { gte: since } },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({ name: r.name, count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }
}
