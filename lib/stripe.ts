import "server-only";
import Stripe from "stripe";

// Stripe on the server only. The secret key lives in Vercel
// (STRIPE_SECRET_KEY) and never reaches the browser.

export function paymentsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.ANSTON_SERVER_SECRET);
}

// Shared secret that lets the server (and only the server) record payments
// and payout accounts in the database. Same value as 'anston_server_secret'
// in Supabase Vault.
export function serverSecret() {
  return process.env.ANSTON_SERVER_SECRET ?? "";
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) {
    // STRIPE_API_HOST is only for local testing against a stand-in server.
    const host = process.env.STRIPE_API_HOST;
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      appInfo: { name: "Anston", url: "https://www.myanston.com" },
      ...(host ? { host, port: Number(process.env.STRIPE_API_PORT ?? 443), protocol: (process.env.STRIPE_API_PROTOCOL as "http" | "https") ?? "https" } : {}),
    });
  }
  return client;
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://www.myanston.com");
}

// Is this Stripe account ready to take payments for this Anston member?
export async function readyAccount(accountId: string, memberId: string) {
  const account = await stripe().accounts.retrieve(accountId);
  return {
    account,
    belongsToMember: account.metadata?.anston_user_id === memberId,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
  };
}
