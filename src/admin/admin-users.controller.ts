import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
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

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  roleKey?: string;
}

@ApiTags('Admin · Users')
@ApiBearerAuth('access-token')
@Controller('admin/users')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

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
    return { ok: true };
  }
}
