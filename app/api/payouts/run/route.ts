import { timingSafeEqual } from "node:crypto";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { releaseHeldPayouts } from "@/lib/payouts";
import { paymentsConfigured, readyAccount, serverSecret } from "@/lib/stripe";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/server";

// Sends sellers the money that has become due (7 days after each purchase,
// with no open refund request). Called hourly by the database (pg_cron),
// which sends the server secret in the x-anston-secret header.
export async function POST(request: Request) {
  const given = Buffer.from(request.headers.get("x-anston-secret") ?? "");
  const expected = Buffer.from(serverSecret());
  if (!paymentsConfigured() || expected.length === 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Not allowed", { status: 401 });
  }

  const supabase = createPlainClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("due_payouts", { p_secret: serverSecret() });
  if (error) {
    console.error("due_payouts", error.message);
    return new Response("Error", { status: 500 });
  }
  let sent = 0;
  for (const s of (data ?? []) as { seller_id: string; stripe_account_id: string }[]) {
    try {
      const status = await readyAccount(s.stripe_account_id, s.seller_id);
      if (status.belongsToMember && status.usable && status.chargesEnabled) {
        sent += await releaseHeldPayouts(s.seller_id, s.stripe_account_id, supabase);
      }
    } catch (e) {
      console.error("payout run", s.seller_id, e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ sent });
}
