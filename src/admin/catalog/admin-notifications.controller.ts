import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { parseAdminSort } from '../../common/admin-sort';

class SendNotificationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsBoolean()
  broadcast?: boolean;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  actionLabel?: string;

  @IsOptional()
  @IsString()
  actionUrl?: string;
}

/// The only way any Notification row is ever created — see
/// src/notifications/notifications.controller.ts's read-only comment.
@ApiTags('Admin · Notifications')
@ApiBearerAuth('access-token')
@Controller('admin/notifications')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all notifications sent, platform-wide' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'sortBy', required: false, description: 'createdAt' })
  @ApiQuery({ name: 'sortDir', required: false, description: 'asc | desc' })
  list(
    @Query('userId') userId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.prisma.notification.findMany({
      where: { userId: userId || undefined },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: parseAdminSort(sortBy, sortDir, ['createdAt'] as const, { createdAt: 'desc' }),
      take: 500,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Send a notification',
    description: 'Send to specific userIds, or set broadcast:true to send to every user.',
  })
  async send(@Body() dto: SendNotificationDto) {
    let userIds = dto.userIds ?? [];
    if (dto.broadcast) {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      userIds = users.map((u) => u.id);
    }
    if (userIds.length === 0) {
      return { ok: true, sentCount: 0 };
    }

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title: dto.title,
        message: dto.message,
        type: dto.type,
        actionLabel: dto.actionLabel,
        actionUrl: dto.actionUrl,
      })),
    });
    return { ok: true, sentCount: userIds.length };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Notification '${id}' not found.`);
    await this.prisma.notification.delete({ where: { id } });
    return { ok: true };
  }
}
