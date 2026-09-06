import { Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { NotificationsService } from './notifications.service';

/// Read surface for the in-app notification feed. Nothing produces rows
/// here yet — other modules emitting a Notification on real events
/// (booking confirmed, payment received, ...) is a future addition, so
/// this will legitimately return an empty list until that exists.
@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My notifications, most recent first' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many of my notifications are unread' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
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

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of my notifications as read' })
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // Scoped by userId inside the service, so this can never mark someone
    // else's notification read even with a valid id.
    const ok = await this.notifications.markRead(user.id, id);
    if (!ok) throw new NotFoundException(`Notification '${id}' not found.`);
    return { ok: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return { updated: await this.notifications.markAllRead(user.id) };
  }
}
