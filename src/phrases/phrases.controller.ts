import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Public · Translator')
@Controller('phrases')
export class PhrasesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Translator phrase pack',
    description:
      'Returns Kinyarwanda / English / French phrases used by the in-app translator. Filter by category — greetings, manners, getting-around, food, numbers.',
  })
  @ApiQuery({ name: 'category', required: false })
  list(@Query('category') category?: string) {
    return this.prisma.phrase.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { english: 'asc' }],
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'Distinct phrase categories' })
  async categories() {
    const rows = await this.prisma.phrase.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category);
  }
}
