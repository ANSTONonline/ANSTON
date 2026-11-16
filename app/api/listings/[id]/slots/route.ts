import { readAvailability, slotsForDay, todayIn } from "@/lib/availability";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

// Open booking times for a service on one day.
// GET /api/listings/<id>/slots?date=2026-12-01  ->  { slots: ["2026-12-01T15:00:00.000Z", ...] }
// The date is read in the seller's time zone.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!supabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ slots: [] }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: mode } = await supabase
    .from("listing_modes")
    .select("session_minutes, availability, time_zone, listing:listings!inner ( status )")
    .eq("listing_id", id)
    .eq("mode", "booking")
    .maybeSingle();
  const availability = readAvailability(mode?.availability);
  const status = (mode?.listing as unknown as { status: string } | null)?.status;
  if (!mode || !availability || !mode.time_zone || status !== "active") return Response.json({ slots: [] });

  // Only the next 90 days can be booked.
  const today = todayIn(mode.time_zone);
  const last = new Date(Date.parse(today + "T00:00:00Z") + 90 * 86400000).toISOString().slice(0, 10);
  if (date < today || date > last) return Response.json({ slots: [] });

  const dayStart = new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString();
  const dayEnd = new Date(Date.parse(date + "T00:00:00Z") + 2 * 86400000).toISOString();
  const { data: taken, error } = await supabase.rpc("booked_times", { p_listing: id, p_from: dayStart, p_to: dayEnd });
  if (error) console.error("booked_times", error.message);

  const slots = slotsForDay({
    availability,
    timeZone: mode.time_zone,
    date,
    sessionMinutes: mode.session_minutes ?? 60,
    booked: ((taken ?? []) as { starts_at: string; ends_at: string }[]).map((b) => ({
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
    })),
  });
  return Response.json({ slots: slots.map((s) => s.toISOString()) }, { headers: { "Cache-Control": "no-store" } });
}
