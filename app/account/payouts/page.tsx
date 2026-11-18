import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { refreshPayoutStatus } from "@/lib/payouts";
import { paymentsConfigured } from "@/lib/stripe";
import { startPayoutSetup } from "./actions";

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

// "Get paid": connect a Stripe account so buyers can pay this seller on Anston.
export default async function PayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const t = await getDictionary(await getLocale());
  const p = t.payouts;
  const flags = await searchParams;

  const { data: saved } = await member.supabase
    .from("payout_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", member.user.id)
    .maybeSingle();

  // Coming back from Stripe (or still waiting): ask Stripe for the latest status.
  let charges = saved?.charges_enabled ?? false;
  let payouts = saved?.payouts_enabled ?? false;
  if (saved && paymentsConfigured() && (!charges || !payouts || flags.returned)) {
    try {
      const status = await refreshPayoutStatus(member.user.id, saved.stripe_account_id, member.supabase);
      if (status) {
        charges = status.chargesEnabled;
        payouts = status.payoutsEnabled;
      }
    } catch (e) {
      console.error("payout status", e instanceof Error ? e.message : e);
    }
  }

  const state = !saved ? "none" : charges ? "ready" : "pending";
  const button = "inline-block bg-[#7A1E2B] text-white rounded-lg px-5 py-2.5 font-medium";

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-2">{p.title}</h1>
      <p className="text-gray-600 mb-6">{p.intro}</p>

      {flags.error && (
        <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {flags.error === "setup" ? p.notAvailable : p.error}
          {member.profile?.is_admin && typeof flags.why === "string" && (
            <span className="block mt-2 text-xs text-red-800" dir="ltr">
              Admin details: {ADMIN_HINTS[flags.why] ?? ADMIN_HINTS.unknown}
              {typeof flags.detail === "string" && <span className="block mt-1 font-mono break-words">{flags.detail}</span>}
            </span>
          )}
        </p>
      )}

      <div className="border rounded-xl p-6 space-y-4">
        {state === "ready" ? (
          <>
            <p className="text-lg font-semibold text-green-700">✅ {p.ready}</p>
            <p className="text-sm text-gray-600">{payouts ? p.readyNote : p.payoutsPending}</p>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className={button}>
              {p.openStripe} ↗
            </a>
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
            <ul className="text-sm text-gray-700 space-y-2 list-disc ps-5">
              <li>{p.point1}</li>
              <li>{p.point2}</li>
              <li>{p.point3}</li>
            </ul>
            <form action={startPayoutSetup}>
              <button type="submit" className={button}>{p.start}</button>
            </form>
          </>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-4">{p.fees}</p>
      <Link href="/account" className="inline-block mt-6 text-sm text-[#7A1E2B] hover:underline">{t.account.title}</Link>
    </main>
  );
}
