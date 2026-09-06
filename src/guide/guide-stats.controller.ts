import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GuideRoleGuard } from './guide-role.guard';
import { addUtcDays, startOfUtcDay } from '../common/dates';

/// Dashboard statistics for the authenticated provider — guide, tour
/// company, or gastronomy host alike.
///
/// Every figure is computed from rows scoped to the caller's own
/// GuideProfile. There are no platform-wide aggregates here, and no
/// hardcoded numbers: the Flutter dashboards previously displayed invented
/// figures because no endpoint like this existed.
///
/// Earnings deliberately count only payments with status SUCCESSFUL and a
/// non-null verifiedAt — money the provider is actually owed, not the face
/// value of unpaid bookings.
@ApiTags('Guide · Dashboard')
@ApiBearerAuth('access-token')
@Controller('guide')
@UseGuards(AuthGuard, GuideRoleGuard)
export class GuideStatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'My dashboard summary' })
  async stats(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    const today = startOfUtcDay(new Date());
    const in7 = addUtcDays(today, 7);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    const scope = { guideId: profile.id };

    const [
      pending,
      confirmed,
      completed,
      cancelled,
      upcoming7,
      totalBookings,
      earningsAllTime,
      earningsThisMonth,
      reviewStats,
      packagesOwned,
    ] = await Promise.all([
      this.prisma.booking.count({ where: { ...scope, status: BookingStatus.PENDING } }),
      this.prisma.booking.count({ where: { ...scope, status: BookingStatus.CONFIRMED } }),
      this.prisma.booking.count({ where: { ...scope, status: BookingStatus.COMPLETED } }),
      this.prisma.booking.count({ where: { ...scope, status: BookingStatus.CANCELLED } }),
      this.prisma.booking.count({
        where: {
          ...scope,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
          scheduleDate: { gte: today, lt: in7 },
        },
      }),
      this.prisma.booking.count({ where: scope }),
      this.sumEarnings(profile.id),
      this.sumEarnings(profile.id, monthStart),
      this.prisma.review.aggregate({
        where: { guideId: profile.id },
        _avg: { starRating: true },
        _count: { _all: true },
      }),
      this.prisma.package.count({ where: { ownerId: profile.id, isActive: true } }),
    ]);

    return {
      guideId: profile.id,
      isVerified: profile.isVerified,
      bookings: {
        total: totalBookings,
        pending,
        confirmed,
        completed,
        cancelled,
        upcomingNext7Days: upcoming7,
      },
      earnings: {
        currency: 'USD',
        allTime: earningsAllTime.toString(),
        thisMonth: earningsThisMonth.toString(),
      },
      reviews: {
        count: reviewStats._count._all,
        averageRating: reviewStats._avg.starRating
          ? Math.round(reviewStats._avg.starRating * 10) / 10
          : null,
      },
      catalog: { activePackages: packagesOwned },
    };
  }

  @Get('earnings')
  @ApiOperation({
    summary: 'My earnings, from verified payments only',
    description:
      'Counts payments the server verified as SUCCESSFUL with the provider. Unpaid or ' +
      'unverified bookings are reported separately as outstanding, never as earnings.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  async earnings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const profile = await this.requireProfile(user);
    const fromDate = from ? startOfUtcDay(from) : undefined;
    const toDate = to ? addUtcDays(startOfUtcDay(to), 1) : undefined;

    const bookings = await this.prisma.booking.findMany({
      where: {
        guideId: profile.id,
        ...(fromDate || toDate
          ? { scheduleDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } }
          : {}),
      },
      select: {
        id: true,
        reference: true,
        scheduleDate: true,
        status: true,
        totalDue: true,
        currency: true,
        guests: true,
        payment: {
          select: { status: true, verifiedAt: true, amount: true, refundedAmount: true },
        },
        package: { select: { name: true } },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { scheduleDate: 'desc' },
      take: 500,
    });

    let earned = new Prisma.Decimal(0);
    let refunded = new Prisma.Decimal(0);
    let outstanding = new Prisma.Decimal(0);

    const lines = bookings.map((b) => {
      const paid =
        b.payment?.status === PaymentStatus.SUCCESSFUL && b.payment.verifiedAt
          ? b.payment.amount
          : new Prisma.Decimal(0);
      const back = b.payment?.refundedAmount ?? new Prisma.Decimal(0);
      earned = earned.add(paid);
      refunded = refunded.add(back);
      const awaitingPayment: BookingStatus[] = [
        BookingStatus.PENDING,
        BookingStatus.PROCESSING,
        BookingStatus.CONFIRMED,
      ];
      if (paid.isZero() && awaitingPayment.includes(b.status)) {
        outstanding = outstanding.add(b.totalDue);
      }
      return {
        bookingId: b.id,
        reference: b.reference,
        date: b.scheduleDate.toISOString().slice(0, 10),
        experience: b.package?.name ?? 'Gastronomy experience',
        customer: b.user.fullName,
        guests: b.guests,
        status: b.status,
        paymentStatus: b.payment?.status ?? null,
        gross: b.totalDue.toString(),
        collected: paid.toString(),
        refunded: back.toString(),
        currency: b.currency,
      };
    });

    return {
      currency: 'USD',
      summary: {
        collected: earned.toString(),
        refunded: refunded.toString(),
        net: earned.sub(refunded).toString(),
        outstanding: outstanding.toString(),
      },
      lines,
    };
  }

  @Get('customers')
  @ApiOperation({
    summary: 'Customers who have booked with me',
    description: 'Only customers with a booking against this provider. Never a platform user list.',
  })
  async customers(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    const bookings = await this.prisma.booking.findMany({
      where: { guideId: profile.id },
      select: {
        totalDue: true,
        scheduleDate: true,
        status: true,
        user: { select: { id: true, fullName: true, email: true, profileImage: true } },
      },
      orderBy: { scheduleDate: 'desc' },
    });

    const byCustomer = new Map<
      string,
      {
        id: string;
        fullName: string | null;
        email: string;
        profileImage: string | null;
        bookings: number;
        completed: number;
        lastBookingDate: string;
        lifetimeValue: Prisma.Decimal;
      }
    >();

    for (const b of bookings) {
      const existing = byCustomer.get(b.user.id);
      if (existing) {
        existing.bookings += 1;
        if (b.status === BookingStatus.COMPLETED) existing.completed += 1;
        existing.lifetimeValue = existing.lifetimeValue.add(b.totalDue);
      } else {
        byCustomer.set(b.user.id, {
          id: b.user.id,
          fullName: b.user.fullName,
          email: b.user.email,
          profileImage: b.user.profileImage,
          bookings: 1,
          completed: b.status === BookingStatus.COMPLETED ? 1 : 0,
          lastBookingDate: b.scheduleDate.toISOString().slice(0, 10),
          lifetimeValue: b.totalDue,
        });
      }
    }

    return [...byCustomer.values()].map((c) => ({
      ...c,
      lifetimeValue: c.lifetimeValue.toString(),
    }));
  }

  private async sumEarnings(guideId: string, since?: Date): Promise<Prisma.Decimal> {
    const rows = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCESSFUL,
        verifiedAt: since ? { not: null, gte: since } : { not: null },
        booking: { guideId },
      },
      select: { amount: true, refundedAmount: true },
    });
    return rows.reduce(
      (total, r) => total.add(r.amount).sub(r.refundedAmount ?? 0),
      new Prisma.Decimal(0),
    );
  }

  private async requireProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.guideProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      throw new NotFoundException('No guide profile yet. Create one with POST /guide/profile.');
    }
    return profile;
  }
}
