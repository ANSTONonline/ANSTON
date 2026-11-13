// Postgres time ranges come back as text, for example
// "[2026-11-20 15:00:00+00,2026-11-21 15:00:00+00)" -> two ISO times
export function periodBounds(period: string) {
  const [start, end] = period.replace(/^[[(]|[\])]$/g, "").split(",").map((s) => s.replace(/"/g, "").trim());
  const iso = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
  return { start: iso(start), end: iso(end) };
}
