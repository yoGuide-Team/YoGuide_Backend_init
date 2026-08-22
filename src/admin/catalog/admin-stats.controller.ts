import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';

/** Raw shape XentriPay's GET /wallets/my-business returns (confirmed live
 * against the sandbox — see yoecopay-worker's passthrough route). */
interface XentriPayBusinessWallet {
  walletId: number;
  businessAccountId: number;
  businessName: string;
  balance: string;
  currency: string;
  active: boolean;
}

@ApiTags('Admin · Stats')
@ApiBearerAuth('access-token')
@Controller('admin/stats')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminStatsController {
  private readonly logger = new Logger(AdminStatsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Real cash held at the payment processor (Centrika/XentriPay), via the
   * yoEcopay worker — NOT the same number as summing our own Wallet ledger
   * (that's money owed to users, not liquidity we actually hold). Best-
   * effort: a gateway hiccup must never break the whole Overview page. */
  private async fetchGatewayWallet(): Promise<{
    balance: number;
    currency: string;
    businessName: string;
  } | null> {
    const base = this.config.get<string>('YOECOPAY_WORKER_BASE');
    const secret = this.config.get<string>('YOECOPAY_APP_SECRET');
    if (!base || !secret) return null;

    try {
      const res = await fetch(`${base}/wallets/my-business`, {
        headers: { 'X-App-Secret': secret },
      });
      if (!res.ok) {
        this.logger.warn(`yoEcopay /wallets/my-business returned ${res.status}`);
        return null;
      }
      const data = (await res.json()) as XentriPayBusinessWallet;
      return {
        balance: Number(data.balance),
        currency: data.currency,
        businessName: data.businessName,
      };
    } catch (err) {
      this.logger.warn(`yoEcopay /wallets/my-business fetch failed: ${err}`);
      return null;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Platform-wide aggregate stats' })
  async get() {
    const [
      userCount,
      guideCount,
      packageCount,
      vehicleCount,
      bookingCount,
      paymentCount,
      usersByRole,
      bookingsByStatus,
      settledRevenue,
      pendingRevenue,
      wallets,
      recentBookings,
      gatewayWallet,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.guideProfile.count(),
      this.prisma.package.count(),
      this.prisma.vehicle.count(),
      this.prisma.booking.count(),
      this.prisma.payment.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESSFUL },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PENDING },
        _sum: { amount: true },
      }),
      this.prisma.wallet.findMany({ select: { balanceCents: true } }),
      this.prisma.booking.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { fullName: true } },
          package: { select: { name: true } },
          guide: { include: { user: { select: { fullName: true } } } },
        },
      }),
      this.fetchGatewayWallet(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        users: userCount,
        guides: guideCount,
        packages: packageCount,
        vehicles: vehicleCount,
        bookings: bookingCount,
        payments: paymentCount,
      },
      usersByRole: usersByRole.map((r) => ({ role: r.role, count: r._count._all })),
      bookingsByStatus: bookingsByStatus.map((b) => ({ status: b.status, count: b._count._all })),
      revenue: {
        currency: 'USD',
        settledTotal: settledRevenue._sum.amount?.toNumber() ?? 0,
        pendingTotal: pendingRevenue._sum.amount?.toNumber() ?? 0,
      },
      // Real cash held at the payment processor right now — the authoritative
      // "liquidity" figure. Null if the gateway call failed/isn't configured.
      gatewayWallet,
      // Sum of our own Wallet ledger — money owed TO users, a different
      // (still useful) number from real liquidity, kept for context.
      internalWalletLiquidityCents: wallets.reduce((sum, w) => sum + w.balanceCents, 0),
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        scheduleDate: b.scheduleDate,
        status: b.status,
        totalDue: b.totalDue.toNumber(),
        userFullName: b.user.fullName,
        packageName: b.package?.name ?? null,
        guideFullName: b.guide?.user?.fullName ?? null,
      })),
    };
  }
}
