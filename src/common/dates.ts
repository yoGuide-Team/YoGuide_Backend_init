/// Date helpers shared by availability and booking logic.
///
/// Booking dates are calendar days, not instants: "the 14th" must mean the
/// same day for a provider in Kigali and a tourist booking from Berlin. We
/// therefore normalise every schedule date to UTC midnight and compare on
/// that, rather than on wall-clock instants.

/// Midnight UTC on the calendar day of `value`.
export function startOfUtcDay(value: Date | string): Date {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/// Midnight UTC on the day after `value`.
export function endOfUtcDay(value: Date | string): Date {
  const start = startOfUtcDay(value);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function addUtcDays(value: Date, days: number): Date {
  return new Date(startOfUtcDay(value).getTime() + days * 24 * 60 * 60 * 1000);
}

/// "YYYY-MM-DD" for a date, in UTC.
export function toDateKey(value: Date | string): string {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

/// 0 = Sunday … 6 = Saturday, matching ProviderAvailability.weekday.
export function utcWeekday(value: Date | string): number {
  return startOfUtcDay(value).getUTCDay();
}

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeString(value: string): boolean {
  return HH_MM.test(value);
}

/// Minutes since midnight for an "HH:mm" string, or null if malformed.
export function minutesFromTimeString(value: string | null | undefined): number | null {
  if (!value || !HH_MM.test(value)) return null;
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

/// Whole hours between two instants, rounded up, floored at 0.
export function hoursBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (60 * 60 * 1000));
}
