import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  addUtcDays,
  isValidTimeString,
  minutesFromTimeString,
  startOfUtcDay,
  toDateKey,
  utcWeekday,
} from '../common/dates';

/// Booking statuses that consume provider capacity. PENDING and PROCESSING
/// hold a slot (so a customer part-way through checkout is not gazumped);
/// DECLINED / CANCELLED / EXPIRED release it. COMPLETED still occupies the
/// day it happened on, which is what we want for historical accuracy.
export const CAPACITY_CONSUMING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.PROCESSING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

export interface DayAvailability {
  date: string;
  available: boolean;
  capacity: number;
  booked: number;
  remaining: number;
  startTime: string | null;
  endTime: string | null;
  reason?: string;
}

/// Server-side availability. This is the only place that decides whether a
/// provider can take a booking on a given date — the clients render what
/// this returns and never make the decision themselves.
///
/// Model: a weekly ProviderAvailability row per weekday the provider works,
/// overridden for individual dates by AvailabilityException, minus guests
/// already committed by capacity-consuming bookings.
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /// Availability for a provider over a date window, for the booking
  /// calendar. Replaces the old stub that reported 14 always-free days.
  async getCalendar(guideId: string, fromInput?: string, days = 30): Promise<DayAvailability[]> {
    const guide = await this.prisma.guideProfile.findUnique({
      where: { id: guideId },
      select: { id: true, dailyCapacity: true },
    });
    if (!guide) throw new NotFoundException(`Guide '${guideId}' not found.`);

    const span = Math.min(Math.max(days, 1), 180);
    const from = startOfUtcDay(fromInput ?? new Date());
    const to = addUtcDays(from, span);

    const [weekly, exceptions, bookings] = await Promise.all([
      this.prisma.providerAvailability.findMany({
        where: { guideId, isActive: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { guideId, date: { gte: from, lt: to } },
      }),
      this.prisma.booking.findMany({
        where: {
          guideId,
          scheduleDate: { gte: from, lt: to },
          status: { in: CAPACITY_CONSUMING_STATUSES },
        },
        select: { scheduleDate: true, guests: true },
      }),
    ]);

    const weeklyByDay = new Map(weekly.map((w) => [w.weekday, w]));
    const exceptionByDate = new Map(exceptions.map((e) => [toDateKey(e.date), e]));
    const bookedByDate = new Map<string, number>();
    for (const b of bookings) {
      const key = toDateKey(b.scheduleDate);
      bookedByDate.set(key, (bookedByDate.get(key) ?? 0) + (b.guests || 1));
    }

    const today = startOfUtcDay(new Date());
    const out: DayAvailability[] = [];

    for (let i = 0; i < span; i++) {
      const date = addUtcDays(from, i);
      const key = toDateKey(date);
      const booked = bookedByDate.get(key) ?? 0;
      const rule = weeklyByDay.get(utcWeekday(date));
      const exception = exceptionByDate.get(key);

      if (date < today) {
        out.push(this.unavailable(key, booked, 'Date is in the past.'));
        continue;
      }
      if (exception?.isBlocked) {
        out.push(this.unavailable(key, booked, exception.reason ?? 'Provider unavailable.'));
        continue;
      }
      if (!rule && !exception) {
        // No weekly rule and no override — the provider has not opened this
        // weekday. Reported honestly as closed rather than assumed free.
        out.push(this.unavailable(key, booked, 'Provider does not work this day.'));
        continue;
      }

      const capacity = exception?.capacity ?? rule?.capacity ?? guide.dailyCapacity;
      const remaining = Math.max(capacity - booked, 0);
      out.push({
        date: key,
        available: remaining > 0,
        capacity,
        booked,
        remaining,
        startTime: rule?.startTime ?? null,
        endTime: rule?.endTime ?? null,
        ...(remaining > 0 ? {} : { reason: 'Fully booked.' }),
      });
    }

    return out;
  }

  /// Throws unless the provider can take `guests` more on `scheduleDate`.
  ///
  /// MUST be called inside a Serializable transaction (see
  /// BookingsController.create) — the read of committed guests and the
  /// write of the new booking have to be one atomic unit, otherwise two
  /// concurrent requests can each see spare capacity and both take the last
  /// seat. Serializable makes Postgres abort the loser instead.
  async assertBookable(
    tx: Prisma.TransactionClient,
    params: {
      guideId: string;
      scheduleDate: Date;
      guests: number;
      startTime?: string | null;
      /// Excluded from the committed-guest count, so re-checking an existing
      /// booking (e.g. a reschedule) does not conflict with itself.
      ignoreBookingId?: string;
    },
  ): Promise<void> {
    const { guideId, guests, ignoreBookingId } = params;
    const date = startOfUtcDay(params.scheduleDate);

    if (guests < 1) throw new BadRequestException('guests must be at least 1.');
    if (date < startOfUtcDay(new Date())) {
      throw new BadRequestException('scheduleDate must not be in the past.');
    }

    const guide = await tx.guideProfile.findUnique({
      where: { id: guideId },
      select: { id: true, dailyCapacity: true },
    });
    if (!guide) throw new NotFoundException(`Guide '${guideId}' not found.`);

    const exception = await tx.availabilityException.findUnique({
      where: { guideId_date: { guideId, date } },
    });
    if (exception?.isBlocked) {
      throw new ConflictException(
        exception.reason
          ? `Provider is unavailable on this date: ${exception.reason}`
          : 'Provider is unavailable on this date.',
      );
    }

    const rule = await tx.providerAvailability.findUnique({
      where: { guideId_weekday: { guideId, weekday: utcWeekday(date) } },
    });
    if (!rule?.isActive && !exception) {
      throw new ConflictException('Provider does not accept bookings on this day.');
    }

    if (params.startTime) {
      this.assertWithinWindow(params.startTime, rule?.startTime ?? null, rule?.endTime ?? null);
    }

    const capacity = exception?.capacity ?? rule?.capacity ?? guide.dailyCapacity;
    const committed = await tx.booking.aggregate({
      where: {
        guideId,
        scheduleDate: date,
        status: { in: CAPACITY_CONSUMING_STATUSES },
        ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}),
      },
      _sum: { guests: true },
    });
    const booked = committed._sum.guests ?? 0;

    if (booked + guests > capacity) {
      const remaining = Math.max(capacity - booked, 0);
      throw new ConflictException(
        remaining === 0
          ? 'Provider is fully booked on this date.'
          : `Only ${remaining} guest place(s) remain on this date.`,
      );
    }
  }

  /// Releases capacity held by PENDING/PROCESSING bookings whose payment
  /// window has lapsed. Idempotent — safe to call on every booking write
  /// and from a scheduled sweep.
  async expireLapsedHolds(): Promise<number> {
    const result = await this.prisma.booking.updateMany({
      where: {
        status: { in: [BookingStatus.PENDING, BookingStatus.PROCESSING] },
        holdExpiresAt: { not: null, lt: new Date() },
      },
      data: { status: BookingStatus.EXPIRED },
    });
    return result.count;
  }

  private assertWithinWindow(startTime: string, open: string | null, close: string | null) {
    if (!isValidTimeString(startTime)) {
      throw new BadRequestException('startTime must be in HH:mm format.');
    }
    const requested = minutesFromTimeString(startTime)!;
    const opensAt = minutesFromTimeString(open);
    const closesAt = minutesFromTimeString(close);
    if (opensAt != null && requested < opensAt) {
      throw new BadRequestException(`Provider starts at ${open} on this day.`);
    }
    if (closesAt != null && requested > closesAt) {
      throw new BadRequestException(`Provider finishes at ${close} on this day.`);
    }
  }

  private unavailable(date: string, booked: number, reason: string): DayAvailability {
    return {
      date,
      available: false,
      capacity: 0,
      booked,
      remaining: 0,
      startTime: null,
      endTime: null,
      reason,
    };
  }
}
