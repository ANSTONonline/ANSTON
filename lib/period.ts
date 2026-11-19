// Postgres time ranges come back as text, for example
// "[2026-11-20 15:00:00+00,2026-11-21 15:00:00+00)" -> two ISO times
export function periodBounds(period: string) {
  const [start, end] = period.replace(/^[[(]|[\])]$/g, "").split(",").map((s) => s.replace(/"/g, "").trim());
  const iso = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
  return { start: iso(start), end: iso(end) };
}

// Rentals priced per day, week or month are booked by calendar date. They're
// stored from noon UTC on the first day to noon UTC on the end day, so the date
// reads the same in nearly every time zone.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const noonUtc = (date: string) => new Date(`${date}T12:00:00.000Z`);
export const isWholeDays = (startIso: string, endIso: string) =>
  startIso.endsWith("T12:00:00.000Z") && endIso.endsWith("T12:00:00.000Z");

// Start date plus either an end date (per day) or a count of weeks/months.
export function wholeDayRange(unit: "day" | "week" | "month", startDate: string, endDate: string, count: number) {
  if (!DATE.test(startDate)) return null;
  const start = noonUtc(startDate);
  const today = new Date();
  const todayNoon = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12) - 36 * 3600000; // allow time-zone lag
  if (Number.isNaN(start.getTime()) || start.getTime() < todayNoon) return null;
  let end: Date;
  if (unit === "day") {
    if (!DATE.test(endDate)) return null;
    end = noonUtc(endDate);
    const days = (end.getTime() - start.getTime()) / 86400000;
    if (!Number.isInteger(days) || days < 1 || days > 365) return null;
  } else {
    const max = unit === "week" ? 52 : 24;
    if (!Number.isInteger(count) || count < 1 || count > max) return null;
    end = new Date(start);
    if (unit === "week") end.setUTCDate(end.getUTCDate() + 7 * count);
    else {
      // Jan 31 + 1 month = Feb 28: stay in the target month (same as the calendar).
      const day = end.getUTCDate();
      end.setUTCDate(1);
      end.setUTCMonth(end.getUTCMonth() + count);
      end.setUTCDate(Math.min(day, new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0, 12)).getUTCDate()));
    }
  }
  return { start, end };
}
