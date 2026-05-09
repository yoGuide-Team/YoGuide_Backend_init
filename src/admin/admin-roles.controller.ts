import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(ROLE_KEY_PATTERN, {
    message:
      'roleKey must be lower-case ASCII, start with a letter, contain only letters, digits, or underscores.',
  })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
}

@ApiTags('Admin · Roles')
@ApiBearerAuth('access-token')
@Controller('admin/roles')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminRolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('roles.read')
  @ApiOperation({
    summary: 'List roles',
    description:
      'Every role in the platform with its permission set and current user-count. System roles (`user`/`admin`/`tour`/`institute`) cannot be deleted; their permissions are still editable.',
  })
  async list() {
    const rows = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
    });
    return Promise.all(
      rows.map(async (r) => ({
        key: r.key,
        label: r.label,
        permissions: r.permissions,
        isSystem: r.isSystem,
        userCount: await this.prisma.user.count({ where: { roleKey: r.key } }),
        createdAt: r.createdAt,
      })),
    );
  }

  @Post()
  @RequirePermissions('roles.write')
  @ApiOperation({
    summary: 'Create role',
    description:
      "Adds a custom (non-system) role. The 'liquid' guarantee — adding a `hotel_manager` or `airline_partner` role is an INSERT, not a code change.",
  })
  async create(@Body() dto: CreateRoleDto) {
    const exists = await this.prisma.role.findUnique({ where: { key: dto.key } });
    if (exists) throw new ConflictException(`Role '${dto.key}' already exists.`);
    const created = await this.prisma.role.create({
      data: {
        key: dto.key,
        label: dto.label,
        permissions: dto.permissions,
        isSystem: false,
      },
    });
    return {
      key: created.key,
      label: created.label,
      permissions: created.permissions,
      isSystem: created.isSystem,
      createdAt: created.createdAt,
    };
  }

  @Patch(':key')
  @RequirePermissions('roles.write')
  @ApiOperation({
    summary: 'Update role',
    description:
      "Edit label and/or permissions. Permission changes apply immediately — every authenticated request re-fetches its user's role on hit.",
  })
  async update(@Param('key') key: string, @Body() dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { key } });
    if (!role) throw new NotFoundException(`Role '${key}' not found.`);
    const updated = await this.prisma.role.update({
      where: { key },
      data: {
        label: dto.label ?? undefined,
        permissions: dto.permissions ?? undefined,
      },
    });
    return {
      key: updated.key,
      label: updated.label,
      permissions: updated.permissions,
      isSystem: updated.isSystem,
      createdAt: updated.createdAt,
    };
  }

  @Delete(':key')
  @RequirePermissions('roles.write')
  @ApiOperation({
    summary: 'Delete role',
    description:
      "Removes a non-system role with no users assigned. Returns 400 if either guard is violated.",
  })
  async remove(@Param('key') key: string) {
    const role = await this.prisma.role.findUnique({ where: { key } });
    if (!role) throw new NotFoundException(`Role '${key}' not found.`);
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted.');
    }
    const userCount = await this.prisma.user.count({ where: { roleKey: key } });
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete '${key}': ${userCount} user(s) still have this role. Reassign them first.`,
      );
    }
    await this.prisma.role.delete({ where: { key } });
    return { ok: true };
  }

}
