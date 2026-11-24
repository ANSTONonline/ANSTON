import { WEEKDAYS, type Availability } from "@/lib/availability";

// Opening hours or service hours, Monday first, in the given time zone.
export default function WeeklyHours({ availability, timeZone, locale, title, zoneNote }: {
  availability: Availability;
  timeZone: string;
  locale: string;
  title: string;
  zoneNote: string;
}) {
  const fmt = (min: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 1, 0, min)),
    );
  const day = (d: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + d)));
  return (
    <div className="border rounded-xl p-4 text-sm">
      <p className="font-medium mb-2">🕒 {title}</p>
      <dl className="space-y-1">
        {WEEKDAYS.filter((d) => availability[String(d)]).map((d) => (
          <div key={d} className="flex justify-between gap-3">
            <dt className="text-gray-600">{day(d)}</dt>
            <dd dir="ltr">{availability[String(d)].map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join(", ")}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500 mt-2">{zoneNote.replace("{zone}", timeZone.replace(/_/g, " "))}</p>
    </div>
  );
}
