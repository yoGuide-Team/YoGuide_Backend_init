import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

@ApiTags('Admin · Audit log')
@ApiBearerAuth('access-token')
@Controller('admin/audit')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({
    summary: 'Audit log',
    description:
      'Append-only ledger of admin / system actions. Filter by entity (user/role/place/booking/wallet/...) or actor.',
  })
  @ApiQuery({ name: 'entity', required: false })
  @ApiQuery({ name: 'actorId', required: false })
  list(
    @Query('entity') entity?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        entity: entity || undefined,
        actorId: actorId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
