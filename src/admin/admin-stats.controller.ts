import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';

@ApiTags('Admin · Stats')
@ApiBearerAuth('access-token')
@Controller('admin/stats')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminStatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('admin.panel.access')
  @ApiOperation({
    summary: 'Platform overview',
    description:
      "Single aggregation feeding the admin dashboard's KPI cards, charts, and recent activity feed. Computed live — every call hits Postgres for fresh counts.",
  })
  async overview() {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = new Date(now.getTime() - 13 * dayMs);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const [
      userCount,
      placeCount,
      bookingCount,
      walletCount,
      walletLiquidity,
      bookingsByStatus,
      bookingsByType,
      placesByKind,
      revenueTotals,
      recentBookings,
      recentWalletTx,
      bookingsByDay,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.place.count(),
      this.prisma.booking.count(),
      this.prisma.wallet.count(),
      this.prisma.wallet.aggregate({ _sum: { balanceCents: true } }),
      this.prisma.booking.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['type'],
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      this.prisma.place.groupBy({
        by: ['kind'],
        _count: { _all: true },
      }),
      this.prisma.bookingTransaction.groupBy({
        by: ['kind'],
        where: { status: 'settled' },
        _sum: { amountCents: true },
      }),
      this.prisma.booking.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { email: true, fullName: true } },
          place: { select: { id: true, name: true } },
        },
      }),
      this.prisma.walletTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { wallet: { include: { user: { select: { email: true } } } } },
      }),
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Booking"
        WHERE "createdAt" >= ${fourteenDaysAgo}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    const totalCharges =
      revenueTotals.find((r) => r.kind === 'charge')?._sum.amountCents ?? 0;
    const totalRefunds =
      revenueTotals.find((r) => r.kind === 'refund')?._sum.amountCents ?? 0;
    const netRevenueCents = totalCharges - totalRefunds;

    // Fill any missing days with zero for a clean 14-day sparkline.
    const trend: Array<{ day: string; count: number }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo.getTime() + i * dayMs);
      const key = d.toISOString().slice(0, 10);
      const hit = bookingsByDay.find(
        (row) => row.day.toISOString().slice(0, 10) === key,
      );
      trend.push({ day: key, count: hit ? Number(hit.count) : 0 });
    }

    return {
      generatedAt: now.toISOString(),
      counts: {
        users: userCount,
        places: placeCount,
        bookings: bookingCount,
        wallets: walletCount,
      },
      money: {
        walletLiquidityCents: walletLiquidity._sum.balanceCents ?? 0,
        settledChargesCents: totalCharges,
        settledRefundsCents: totalRefunds,
        netRevenueCents,
        currency: 'USD',
      },
      bookingsByStatus: bookingsByStatus.map((b) => ({
        status: b.status,
        count: b._count._all,
      })),
      bookingsByType: bookingsByType.map((b) => ({
        type: b.type,
        count: b._count._all,
        totalCents: b._sum.totalCents ?? 0,
      })),
      placesByKind: placesByKind.map((p) => ({
        kind: p.kind,
        count: p._count._all,
      })),
      bookingsTrend: trend,
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        type: b.type,
        status: b.status,
        totalCents: b.totalCents,
        currency: b.currency,
        createdAt: b.createdAt,
        userEmail: b.user.email,
        userFullName: b.user.fullName,
        placeName: b.place?.name ?? null,
      })),
      recentWalletTransactions: recentWalletTx.map((t) => ({
        id: t.id,
        kind: t.kind,
        amountCents: t.amountCents,
        currency: t.currency,
        createdAt: t.createdAt,
        userEmail: t.wallet.user.email,
        bookingId: t.bookingId,
        notes: t.notes,
      })),
    };
  }
}
