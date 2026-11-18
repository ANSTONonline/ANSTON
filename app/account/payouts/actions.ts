"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { paymentsConfigured, serverSecret, siteUrl, stripe } from "@/lib/stripe";

// Send the seller to Stripe to connect (or finish connecting) their payout
// account. Sellers get their own Stripe account; Stripe charges them its
// normal fee on each sale.
export async function startPayoutSetup() {
  const member = await requireMember();
  if (!paymentsConfigured()) redirect("/account/payouts?error=setup");
  const { data: existing } = await member.supabase
    .from("payout_accounts")
    .select("stripe_account_id")
    .eq("user_id", member.user.id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id ?? "";
  let onboardingUrl = "";
  try {
    if (!accountId) {
      // Stripe's Accounts v2: the seller gets the full Stripe Dashboard, and
      // Stripe collects its fees from them and covers losses (direct charges).
      const account = await stripe().v2.core.accounts.create({
        contact_email: member.user.email ?? undefined,
        display_name: member.profile?.display_name || member.profile?.username || undefined,
        dashboard: "full",
        defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        metadata: { anston_user_id: member.user.id },
      });
      accountId = account.id;
      const { error } = await member.supabase.rpc("save_payout_account", {
        p_account: accountId,
        p_charges: false,
        p_payouts: false,
        p_secret: serverSecret(),
      });
      if (error) throw new Error(error.message);
    }
    const link = await stripe().v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          refresh_url: `${siteUrl()}/account/payouts?refresh=1`,
          return_url: `${siteUrl()}/account/payouts?returned=1`,
        },
      },
    });
    onboardingUrl = link.url;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("startPayoutSetup", message);
    // Say which step failed, so an admin can fix it. Secrets are scrubbed.
    const type = (e as { type?: string })?.type ?? "";
    const code =
      type === "StripeAuthenticationError" ? "key"
      : type === "StripePermissionError" ? "permission"
      : type.startsWith("Stripe") ? "stripe"
      : /does not exist|schema cache/i.test(message) ? "database"
      : /not_allowed/i.test(message) ? "secret"
      : "unknown";
    const detail = message.replace(/(sk|rk|pk)_(test|live)_[A-Za-z0-9*]+/g, "[key]").slice(0, 200);
    redirect(`/account/payouts?error=stripe&why=${code}&detail=${encodeURIComponent(detail)}`);
  }
  redirect(onboardingUrl || "/account/payouts?error=stripe");
}
