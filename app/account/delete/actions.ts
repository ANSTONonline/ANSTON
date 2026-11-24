"use server";

import { redirect } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export type DeleteAccountState = { error?: "confirm" | "openOrders" | "heldMoney" | "generic" };

// The word people type to confirm. Kept in English in every language so it's
// the same everywhere (the instructions around it are translated).
const CONFIRM_WORD = "DELETE";

// Storage buckets where members keep files in a folder named after their user id.
const BUCKETS = ["avatars", "listing-images", "business-docs"];

async function removeMyFiles(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  for (const bucket of BUCKETS) {
    const store = supabase.storage.from(bucket);
    // Files are stored as "<user id>/<file>"; remove them a page at a time.
    for (let round = 0; round < 50; round++) {
      const { data, error } = await store.list(userId, { limit: 1000 });
      if (error || !data || data.length === 0) break;
      const paths = data.filter((f) => f.id).map((f) => `${userId}/${f.name}`);
      if (paths.length === 0) break;
      const { error: removeError } = await store.remove(paths);
      if (removeError) break;
    }
  }
}

// Permanently deletes the signed-in person's account (see the
// delete_my_account database function for exactly what is removed).
export async function deleteAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== CONFIRM_WORD) return { error: "confirm" };
  if (!supabaseConfigured()) return { error: "generic" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account");

  // Check first, so photos are only removed when the account really goes.
  const { data: blocker, error: checkError } = await supabase.rpc("account_deletion_blocker");
  if (checkError) return { error: "generic" };
  if (blocker === "open_orders") return { error: "openOrders" };
  if (blocker === "held_money") return { error: "heldMoney" };

  await removeMyFiles(supabase, user.id);

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    if (error.message.includes("open_orders")) return { error: "openOrders" };
    if (error.message.includes("held_money")) return { error: "heldMoney" };
    return { error: "generic" };
  }

  // The login no longer exists; clear this browser's session cookies.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/account/delete?done=1");
}
