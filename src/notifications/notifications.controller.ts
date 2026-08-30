import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

/// Read surface for the in-app notification feed. Nothing produces rows
/// here yet — other modules emitting a Notification on real events
/// (booking confirmed, payment received, ...) is a future addition, so
/// this will legitimately return an empty list until that exists.
@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'My notifications, most recent first' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my notifications by id' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId: user.id },
    });
    if (!notification) throw new NotFoundException(`Notification '${id}' not found.`);
    return notification;
  }
}
