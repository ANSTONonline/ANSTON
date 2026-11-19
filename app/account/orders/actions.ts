"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { CARRIERS } from "@/lib/orders";
import { paymentsConfigured, serverSecret, stripe } from "@/lib/stripe";

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

// Buyer: rate the seller once the order has shipped. The database checks the
// order, that this member is its buyer, and allows one review per order.
export async function leaveReview(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const rating = Number(text(fd, "rating"));
  const comment = text(fd, "comment").slice(0, 2000);
  if (!isId(id)) return;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) redirect(`/account/orders/${id}?error=1`);
  const { data: order } = await member.supabase.from("orders").select("buyer_id, seller_id").eq("id", id).maybeSingle();
  if (!order || order.buyer_id !== member.user.id) redirect(`/account/orders/${id}?error=1`);
  const { error } = await member.supabase.from("reviews").insert({
    order_id: id,
    reviewer_id: member.user.id,
    reviewee_id: order.seller_id,
    rating,
    comment: comment || null,
  });
  if (error) {
    console.error("leaveReview", error.message);
    redirect(`/account/orders/${id}?error=1`);
  }
  revalidatePath(`/account/orders/${id}`);
  redirect(`/account/orders/${id}?reviewed=1`);
}

const REFUND_REASONS = ["not_received", "not_as_described", "changed_mind", "other"];

// Buyer: ask for a refund (within 7 days of paying). The database checks the
// window, that this member is the buyer, and one request per order.
export async function requestRefund(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const reason = text(fd, "reason");
  if (!isId(id)) return;
  if (!REFUND_REASONS.includes(reason)) redirect(`/account/orders/${id}?error=1`);
  const { error } = await member.supabase.rpc("request_refund", { p_order: id, p_reason: reason, p_details: text(fd, "details").slice(0, 1000) });
  if (error) {
    console.error("requestRefund", error.message);
    redirect(`/account/orders/${id}?error=${error.message.includes("refund_window_closed") ? "window" : "1"}`);
  }
  revalidatePath(`/account/orders/${id}`);
  redirect(`/account/orders/${id}?refund=requested`);
}

// Seller or admin: decline a refund request.
export async function declineRefund(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const request = text(fd, "request");
  if (!isId(id) || !isId(request)) return;
  const { error } = await member.supabase.rpc("decline_refund", { p_request: request });
  if (error) {
    console.error("declineRefund", error.message);
    redirect(`/account/orders/${id}?error=1`);
  }
  revalidatePath(`/account/orders/${id}`);
  redirect(`/account/orders/${id}?refund=declined`);
}

// Seller or admin: approve a refund request. The whole payment goes back to
// the buyer's card from the money Anston still holds.
export async function approveRefund(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const request = text(fd, "request");
  if (!isId(id) || !isId(request) || !paymentsConfigured()) return;
  const { data, error } = await member.supabase.rpc("refund_to_issue", { p_request: request });
  const row = ((data ?? []) as { order_id: string; stripe_payment_intent_id: string }[])[0];
  if (error || !row) {
    console.error("refund_to_issue", error?.message);
    redirect(`/account/orders/${id}?error=1`);
  }
  let ok = false;
  try {
    const refund = await stripe().refunds.create(
      { payment_intent: row.stripe_payment_intent_id, metadata: { anston_order_id: row.order_id } },
      { idempotencyKey: `anston-refund-${request}` },
    );
    const { error: markError } = await member.supabase.rpc("mark_refunded", { p_request: request, p_refund: refund.id, p_secret: serverSecret() });
    if (markError) throw new Error(markError.message);
    ok = true;
  } catch (e) {
    console.error("approveRefund", e instanceof Error ? e.message : e);
  }
  revalidatePath(`/account/orders/${id}`);
  redirect(`/account/orders/${id}?${ok ? "refund=approved" : "error=1"}`);
}
