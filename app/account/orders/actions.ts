"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { CARRIERS } from "@/lib/orders";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

// Seller: add tracking, which marks the order shipped. The database checks
// that this member is the seller and the order is paid.
export async function markShipped(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const carrier = text(fd, "carrier");
  const tracking = text(fd, "tracking").slice(0, 100);
  if (!isId(id)) return;
  if (!(CARRIERS as readonly string[]).includes(carrier)) redirect(`/account/orders/${id}?error=carrier`);
  const { error } = await member.supabase.rpc("mark_order_shipped", { p_order: id, p_carrier: carrier, p_tracking: tracking });
  if (error) {
    console.error("markShipped", error.message);
    redirect(`/account/orders/${id}?error=1`);
  }
  revalidatePath("/account/orders");
  redirect(`/account/orders/${id}?shipped=1`);
}

// Buyer: the item arrived.
export async function confirmReceived(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  if (!isId(id)) return;
  const { error } = await member.supabase.rpc("confirm_order_received", { p_order: id });
  if (error) {
    console.error("confirmReceived", error.message);
    redirect(`/account/orders/${id}?error=1`);
  }
  revalidatePath("/account/orders");
  redirect(`/account/orders/${id}?received=1`);
}
