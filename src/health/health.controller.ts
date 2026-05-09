import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponse } from '../common/responses';

@ApiTags('Public')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Service health',
    description:
      "Open endpoint. Returns `status`, a quick DB ping result, and the server's process uptime in seconds. Use this for liveness probes and the operator dashboard top bar.",
  })
  @ApiOkResponse({
    description: 'Server is up. `db` is `down` if the Postgres ping failed.',
    type: HealthResponse,
  })
  async check() {
    let db: 'ok' | 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      db = 'down';
    }
    return {
      status: 'ok',
      db,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
