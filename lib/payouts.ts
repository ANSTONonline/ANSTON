import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { readyAccount, serverSecret, stripe } from "@/lib/stripe";

// Ask Stripe for the latest status and save it. Sends any held money once
// the account can receive it.
export async function refreshPayoutStatus(memberId: string, accountId: string, supabase: SupabaseClient) {
  const status = await readyAccount(accountId, memberId);
  if (!status.belongsToMember) return null;
  const ready = status.usable && status.chargesEnabled;
  await supabase.rpc("save_payout_account", {
    p_account: accountId,
    p_charges: ready,
    p_payouts: status.usable && status.payoutsEnabled,
    p_secret: serverSecret(),
  });
  if (ready) await releaseHeldPayouts(memberId, accountId, supabase);
  return { ...status, chargesEnabled: ready };
}

type Held = {
  order_id: string; stripe_charge_id: string; total_cents: number; service_fee_cents: number; boost_cents: number; label_cost_cents: number;
};

// Send a seller's held money to their Stripe account. The seller gets the
// price plus shipping, minus their boost, their share of Stripe's card fee
// and any shipping label they bought through Anston. Amounts come from Stripe's own record of the charge, in the currency
// Anston was paid in. Safe to repeat: each order is sent at most once.
export async function releaseHeldPayouts(sellerId: string, accountId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("held_payouts", { p_seller: sellerId, p_secret: serverSecret() });
  if (error) {
    console.error("held_payouts", error.message);
    return 0;
  }
  let sent = 0;
  for (const o of (data ?? []) as Held[]) {
    try {
      const charge = await stripe().charges.retrieve(o.stripe_charge_id, { expand: ["balance_transaction"] });
      const bt = charge.balance_transaction as Stripe.BalanceTransaction | null;
      if (!bt || typeof bt === "string" || o.total_cents <= 0) continue;
      const sellerGross = o.total_cents - o.service_fee_cents; // price + shipping (+ tax)
      // Labels are only sold on USD orders, so their cost is in the same currency Anston was paid in.
      const label = bt.currency === "usd" ? Number(o.label_cost_cents ?? 0) : 0;
      const amount = Math.floor(
        (bt.amount * (sellerGross - o.boost_cents)) / o.total_cents - (bt.fee * sellerGross) / o.total_cents - label,
      );
      let transferId = "";
      if (amount > 0) {
        const transfer = await stripe().transfers.create(
          {
            amount,
            currency: bt.currency,
            destination: accountId,
            source_transaction: charge.id,
            transfer_group: o.order_id,
            metadata: { anston_order_id: o.order_id },
          },
          { idempotencyKey: `anston-payout-${o.order_id}` },
        );
        transferId = transfer.id;
      }
      const { error: markError } = await supabase.rpc("mark_payout_sent", {
        p_order: o.order_id,
        p_transfer: transferId || null,
        p_amount: Math.max(amount, 0),
        p_currency: bt.currency,
        p_secret: serverSecret(),
      });
      if (markError) throw new Error(markError.message);
      sent++;
    } catch (e) {
      console.error("payout", o.order_id, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
