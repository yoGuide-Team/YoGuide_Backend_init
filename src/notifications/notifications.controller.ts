import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class BroadcastDto {
  @IsIn(['booking', 'payment', 'system', 'announcement']) kind!: string;
  @IsString() @MinLength(2) title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() link?: string;
}

class DirectDto extends BroadcastDto {}

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'My notifications',
    description: 'Includes both user-targeted notifications and broadcasts (where userId is null).',
  })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException('Notification not found.');
    if (n.userId !== null && n.userId !== user.id) {
      throw new NotFoundException('Notification not found.');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({
      where: {
        OR: [{ userId: user.id }, { userId: null }],
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}

@ApiTags('Admin · Notifications')
@ApiBearerAuth('access-token')
@Controller('admin/notifications')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('broadcast')
  @RequirePermissions('notifications.send')
  @ApiOperation({
    summary: 'Send broadcast notification',
    description: 'Reaches every signed-in user. Use sparingly — there is no opt-out yet.',
  })
  broadcast(@Body() dto: BroadcastDto) {
    return this.prisma.notification.create({
      data: {
        userId: null,
        kind: dto.kind,
        title: dto.title,
        body: dto.body,
        link: dto.link,
      },
    });
  }

  @Post('user/:userId')
  @RequirePermissions('notifications.send')
  @ApiOperation({ summary: 'Send direct notification to one user' })
  direct(@Param('userId') userId: string, @Body() dto: DirectDto) {
    return this.prisma.notification.create({
      data: {
        userId,
        kind: dto.kind,
        title: dto.title,
        body: dto.body,
        link: dto.link,
      },
    });
  }

  @Get()
  @RequirePermissions('notifications.send')
  @ApiOperation({ summary: 'List recent notifications (admin view)' })
  list() {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
