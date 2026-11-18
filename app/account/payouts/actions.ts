"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { STRIPE_COUNTRIES, paymentsConfigured, readyAccount, serverSecret, siteUrl, stripe } from "@/lib/stripe";

// Send the seller to Stripe's short setup (or back to finish it). Sellers get
// a simple Express account that receives their money from Anston.
export async function startPayoutSetup(fd: FormData) {
  const member = await requireMember();
  if (!paymentsConfigured()) redirect("/account/payouts?error=setup");
  const { data: existing } = await member.supabase
    .from("payout_accounts")
    .select("stripe_account_id")
    .eq("user_id", member.user.id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id ?? "";
  if (accountId) {
    // Older full Stripe accounts can't receive held money: start a new, simple one.
    try {
      const status = await readyAccount(accountId, member.user.id);
      if (!status.usable || !status.belongsToMember) accountId = "";
    } catch {
      accountId = "";
    }
  }
  // Stripe needs the seller's country before it creates the account.
  const country = String(fd.get("country") ?? "").toUpperCase();
  if (!accountId && !(STRIPE_COUNTRIES as readonly string[]).includes(country)) redirect("/account/payouts?error=country");
  let onboardingUrl = "";
  try {
    if (!accountId) {
      // Stripe's Accounts v2: an Express account (short Anston-branded setup,
      // light dashboard) that receives transfers from Anston. Anston takes the
      // payments, so it handles Stripe's fees and any refunds or chargebacks.
      const account = await stripe().v2.core.accounts.create({
        contact_email: member.user.email ?? undefined,
        display_name: member.profile?.display_name || member.profile?.username || undefined,
        dashboard: "express",
        identity: { country: country.toLowerCase() },
        defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
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

// "View your payouts": a one-time sign-in link to the seller's Stripe Express dashboard.
export async function openPayoutDashboard() {
  const member = await requireMember();
  const { data: saved } = await member.supabase
    .from("payout_accounts")
    .select("stripe_account_id")
    .eq("user_id", member.user.id)
    .maybeSingle();
  if (!saved || !paymentsConfigured()) redirect("/account/payouts");
  let url = "";
  try {
    url = (await stripe().accounts.createLoginLink(saved.stripe_account_id)).url;
  } catch (e) {
    console.error("login link", e instanceof Error ? e.message : e);
  }
  redirect(url || "/account/payouts?error=stripe");
}
