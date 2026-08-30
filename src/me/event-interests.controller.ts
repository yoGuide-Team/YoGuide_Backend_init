import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class SaveEventInterestsDto {
  @IsArray()
  @IsString({ each: true })
  eventIds!: string[];

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;
}

/// POST /me/event-interests — records which onboarding "what's on" events
/// the user tapped interested-in. Silently skips any id that doesn't match
/// a real Event row rather than failing the whole batch on one bad id.
@ApiTags('Account · Event Interests')
@ApiBearerAuth('access-token')
@Controller('me/event-interests')
@UseGuards(AuthGuard)
export class MeEventInterestsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({ summary: 'Save which events the user is interested in' })
  async save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveEventInterestsDto) {
    const reminderEnabled = dto.reminderEnabled ?? false;
    const existingEvents = await this.prisma.event.findMany({
      where: { id: { in: dto.eventIds } },
      select: { id: true },
    });
    const validIds = existingEvents.map((e) => e.id);

    await this.prisma.$transaction(
      validIds.map((eventId) =>
        this.prisma.eventInterest.upsert({
          where: { userId_eventId: { userId: user.id, eventId } },
          update: { reminderEnabled },
          create: { userId: user.id, eventId, reminderEnabled },
        }),
      ),
    );

    return { ok: true, savedCount: validIds.length };
  }
}
