import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readyAccount, serverSecret } from "@/lib/stripe";

// Ask Stripe for the latest status and save it.
export async function refreshPayoutStatus(memberId: string, accountId: string, supabase: SupabaseClient) {
  const status = await readyAccount(accountId, memberId);
  if (!status.belongsToMember) return null;
  await supabase.rpc("save_payout_account", {
    p_account: accountId,
    p_charges: status.chargesEnabled,
    p_payouts: status.payoutsEnabled,
    p_secret: serverSecret(),
  });
  return status;
}
