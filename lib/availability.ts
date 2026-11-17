// Weekly availability for service listings, and the open time slots a buyer
// can book. Times are stored in the seller's time zone as minutes after
// midnight, per weekday (0 = Sunday ... 6 = Saturday), for example:
//   { "1": [[540, 1020]], "2": [[540, 1020]] }   -> Mon and Tue, 9:00–17:00

export type Availability = Record<string, [number, number][]>;

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]; // shown Monday first
export const DEFAULT_HOURS = { from: "09:00", to: "17:00", days: [1, 2, 3, 4, 5] };

export function minutesFromTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function timeFromMinutes(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isTimeZone(tz: string) {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Reads a stored value safely (it may be missing or hand-edited).
export function readAvailability(value: unknown): Availability | null {
  if (!value || typeof value !== "object") return null;
  const out: Availability = {};
  for (const day of WEEKDAYS) {
    const list = (value as Record<string, unknown>)[String(day)];
    if (!Array.isArray(list)) continue;
    const windows = list
      .filter((w): w is [number, number] => Array.isArray(w) && w.length === 2 && w.every((n) => Number.isInteger(n)))
      .filter(([a, b]) => a >= 0 && b <= 1440 && a < b);
    if (windows.length) out[String(day)] = windows;
  }
  return Object.keys(out).length ? out : null;
}

// How far a time zone is ahead of UTC at a given moment, in milliseconds.
function zoneOffset(utcMillis: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMillis));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - utcMillis;
}

// The UTC moment for a wall-clock time (date "YYYY-MM-DD" + minutes) in a zone.
export function zonedToUtc(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let utc = guess - zoneOffset(guess, tz);
  utc = guess - zoneOffset(utc, tz); // second pass handles daylight-saving changes
  return new Date(utc);
}

export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Today's date ("YYYY-MM-DD") in a time zone.
export function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Open session start times on one day, as UTC instants.
export function slotsForDay(opts: {
  availability: Availability;
  timeZone: string;
  date: string;
  sessionMinutes: number;
  booked: { start: Date; end: Date }[];
  now?: Date;
}): Date[] {
  const { availability, timeZone, date, sessionMinutes, booked } = opts;
  const earliest = (opts.now ?? new Date()).getTime() + 30 * 60000; // at least 30 minutes' notice
  const windows = availability[String(weekdayOf(date))] ?? [];
  const slots: Date[] = [];
  for (const [from, to] of windows) {
    for (let start = from; start + sessionMinutes <= to; start += sessionMinutes) {
      const s = zonedToUtc(date, start, timeZone);
      const e = new Date(s.getTime() + sessionMinutes * 60000);
      if (s.getTime() < earliest) continue;
      if (booked.some((b) => s < b.end && e > b.start)) continue;
      slots.push(s);
    }
  }
  return slots;
}
