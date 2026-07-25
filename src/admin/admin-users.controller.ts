import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AuditLogService } from '../audit/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  roleKey?: string;
}

export class RejectIdentityDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

@ApiTags('Admin · Users')
@ApiBearerAuth('access-token')
@Controller('admin/users')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({
    summary: 'List users',
    description: 'Requires `users.read`. Newest first.',
  })
  async list() {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { role: { select: { label: true } } },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      roleKey: u.roleKey,
      roleLabel: u.role.label,
      createdAt: u.createdAt,
      identityStatus: u.identityStatus,
      identityDocUrls: u.identityDocUrls,
      identityRejectionReason: u.identityRejectionReason,
    }));
  }

  @Patch(':id')
  @RequirePermissions('users.write')
  @ApiOperation({
    summary: 'Update user',
    description:
      "Edit name and/or role. Self-demotion out of admin is rejected (operators have to keep at least one admin who isn't them). Requires `users.write`.",
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found.');

    if (dto.roleKey && dto.roleKey !== target.roleKey) {
      const role = await this.prisma.role.findUnique({ where: { key: dto.roleKey } });
      if (!role) throw new NotFoundException(`Role '${dto.roleKey}' does not exist.`);
      // Prevent the actor from demoting themselves out of the admin role —
      // a common foot-gun.
      if (actor.id === target.id && !role.permissions.includes('*')) {
        throw new ForbiddenException('You cannot change your own role from admin.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName !== undefined ? dto.fullName : undefined,
        roleKey: dto.roleKey ?? undefined,
      },
      include: { role: { select: { label: true } } },
    });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'user.update',
      entity: 'User',
      entityId: id,
      metadata: { fullName: dto.fullName, roleKey: dto.roleKey },
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      roleKey: updated.roleKey,
      roleLabel: updated.role.label,
      createdAt: updated.createdAt,
    };
  }

  @Delete(':id')
  @RequirePermissions('users.write')
  @ApiOperation({
    summary: 'Delete user',
    description:
      "Permanently removes the account. The actor cannot delete themselves. Cascades to wallet + wallet transactions; bookings remain (history is preserved).",
  })
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    if (actor.id === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found.');
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'user.delete',
      entity: 'User',
      entityId: id,
      metadata: { email: target.email },
    });
    return { ok: true };
  }

  @Post(':id/verify-identity')
  @RequirePermissions('users.write')
  @ApiOperation({
    summary: 'Approve identity verification',
    description:
      "Sets identityStatus to 'approved', unlocking POST /wallet/topup for this user (the doc's \"yoEcoPay and Wallet require identity verification approved by Admin\" rule).",
  })
  async verifyIdentity(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found.');
    if (target.identityStatus !== 'pending') {
      throw new BadRequestException('This user has no pending identity verification.');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { identityStatus: 'approved', identityRejectionReason: null },
      select: { id: true, email: true, fullName: true, identityStatus: true },
    });
    await this.notifications.notifyVerificationApproved(id, 'identity');
    await this.mail.sendApplicationStatusEmail(updated.email, updated.fullName ?? 'there', 'identity', 'approved');
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'user.verify_identity',
      entity: 'User',
      entityId: id,
    });
    return updated;
  }

  @Post(':id/reject-identity')
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Reject identity verification with a reason' })
  async rejectIdentity(
    @Param('id') id: string,
    @Body() dto: RejectIdentityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found.');
    if (target.identityStatus !== 'pending') {
      throw new BadRequestException('This user has no pending identity verification.');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { identityStatus: 'rejected', identityRejectionReason: dto.reason },
      select: { id: true, email: true, fullName: true, identityStatus: true },
    });
    await this.notifications.notifyVerificationRejected(id, 'identity', dto.reason);
    await this.mail.sendApplicationStatusEmail(updated.email, updated.fullName ?? 'there', 'identity', 'rejected', dto.reason);
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'user.reject_identity',
      entity: 'User',
      entityId: id,
      metadata: { reason: dto.reason },
    });
    return updated;
  }
}
