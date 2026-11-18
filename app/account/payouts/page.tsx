import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { refreshPayoutStatus } from "@/lib/payouts";
import { STRIPE_COUNTRIES, paymentsConfigured } from "@/lib/stripe";
import { getPlaceFilter } from "@/lib/location-filter";
import { openPayoutDashboard, startPayoutSetup } from "./actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Shown only to admins when payout setup fails, to point at the fix.
const ADMIN_HINTS: Record<string, string> = {
  key: "Stripe rejected the secret key. Check STRIPE_SECRET_KEY in Vercel (it should start with sk_test_ in the sandbox), then redeploy.",
  permission: "The Stripe key isn't allowed to do this. Use the standard secret key, not a restricted key.",
  stripe: "Stripe refused the request. The message below says why; often Connect settings need finishing in the Stripe dashboard.",
  database: "A database function is missing. Run the latest payments migration in the Supabase SQL Editor.",
  secret: "The server secret doesn't match. ANSTON_SERVER_SECRET in Vercel must equal 'anston_server_secret' in Supabase Vault; redeploy after changing it.",
  unknown: "Unexpected error. The message below has details.",
};

// "Get paid": add bank details (through Stripe) so the money from sales reaches
// the seller. Buyers can pay before this is done; the money waits until then.
export default async function PayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const p = t.payouts;
  const flags = await searchParams;

  const { data: saved } = await member.supabase
    .from("payout_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", member.user.id)
    .maybeSingle();

  // Ask Stripe for the latest status (this also sends any held money once ready).
  let charges = saved?.charges_enabled ?? false;
  let payouts = saved?.payouts_enabled ?? false;
  let usable = true;
  if (saved && paymentsConfigured()) {
    try {
      const status = await refreshPayoutStatus(member.user.id, saved.stripe_account_id, member.supabase);
      if (status) {
        charges = status.chargesEnabled;
        payouts = status.payoutsEnabled;
        usable = status.usable;
      }
    } catch (e) {
      console.error("payout status", e instanceof Error ? e.message : e);
    }
  }

  // Country choices in the visitor's language; start with the browsing location if Stripe supports it.
  const regionName = new Intl.DisplayNames([locale], { type: "region" });
  const countries = STRIPE_COUNTRIES.map((code) => ({ code, name: regionName.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
  const place = await getPlaceFilter();
  const defaultCountry = place && (STRIPE_COUNTRIES as readonly string[]).includes(place.country) ? place.country : "US";

  // Sales whose money is waiting for this seller.
  const { count: held } = await member.supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", member.user.id)
    .eq("payout_status", "held");

  const state = !saved || !usable ? "none" : charges ? "ready" : "pending";
  const button = "inline-block bg-[#7A1E2B] text-white rounded-lg px-5 py-2.5 font-medium";

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-2">{p.title}</h1>
      <p className="text-gray-600 mb-6">{p.intro}</p>

      {flags.error && (
        <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {flags.error === "setup" ? p.notAvailable : flags.error === "country" ? p.countryMissing : p.error}
          {member.profile?.is_admin && typeof flags.why === "string" && (
            <span className="block mt-2 text-xs text-red-800" dir="ltr">
              Admin details: {ADMIN_HINTS[flags.why] ?? ADMIN_HINTS.unknown}
              {typeof flags.detail === "string" && <span className="block mt-1 font-mono break-words">{flags.detail}</span>}
            </span>
          )}
        </p>
      )}

      {state !== "ready" && (held ?? 0) > 0 && (
        <p className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm font-medium">
          💰 {p.heldCount.replace("{n}", String(held))}
        </p>
      )}

      <div className="border rounded-xl p-6 space-y-4">
        {state === "ready" ? (
          <>
            <p className="text-lg font-semibold text-green-700">✅ {p.ready}</p>
            <p className="text-sm text-gray-600">{payouts ? p.readyNote : p.payoutsPending}</p>
            <form action={openPayoutDashboard}>
              <button type="submit" className={button}>{p.openStripe}</button>
            </form>
          </>
        ) : state === "pending" ? (
          <>
            <p className="text-lg font-semibold text-amber-700">⏳ {p.pending}</p>
            <p className="text-sm text-gray-600">{p.pendingNote}</p>
            <form action={startPayoutSetup}>
              <button type="submit" className={button}>{p.finish}</button>
            </form>
          </>
        ) : (
          <>
            <form action={startPayoutSetup} className="space-y-4">
              <label className="block text-sm">
                <span className="block font-medium mb-1">{p.country}</span>
                <select name="country" defaultValue={defaultCountry} required className="w-full border rounded-lg px-3 py-2 bg-white">
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
                <span className="block text-xs text-gray-500 mt-1">{p.countryNote}</span>
              </label>
              <button type="submit" className={button}>{p.start}</button>
              <p className="text-xs text-gray-500">🔒 {p.secureNote}</p>
            </form>
          </>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-4">{p.fees}</p>
      <Link href="/account" className="inline-block mt-6 text-sm text-[#7A1E2B] hover:underline">{t.account.title}</Link>
    </main>
  );
}
