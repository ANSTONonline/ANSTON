"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";

export async function sendReply(fd: FormData) {
  const member = await requireMember();
  const conversationId = String(fd.get("conversation") ?? "");
  const body = String(fd.get("body") ?? "").trim().slice(0, 5000);
  if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !body) return;
  // Row level security only lets the two people in the conversation post.
  const { error } = await member.supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: member.user.id, body });
  if (error) console.error("sendReply", error.message);
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
}

// Opens the conversation about a listing, starting it if needed, then goes
// to it. Buyers can message the seller any time. Sellers can message a buyer
// (form field "buyer") only after a purchase: an accepted offer, a confirmed
// rental or booking, a won auction or a paid order. The database enforces it.
export async function openConversation(fd: FormData) {
  const member = await requireMember();
  const listingId = String(fd.get("listing") ?? "");
  const buyerField = String(fd.get("buyer") ?? "");
  const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
  if (!isId(listingId)) return;

  const { data: listing } = await member.supabase
    .from("listings")
    .select("id, seller_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return;

  const iAmSeller = listing.seller_id === member.user.id;
  const buyerId = iAmSeller ? buyerField : member.user.id;
  if (!isId(buyerId) || buyerId === listing.seller_id) return;

  const { data: existing } = await member.supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  let id = existing?.id;
  if (!id) {
    const { data: created, error } = await member.supabase
      .from("conversations")
      .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: listing.seller_id })
      .select("id")
      .single();
    if (error || !created) {
      console.error("openConversation", error?.message);
      return;
    }
    id = created.id;
  }
  redirect(`/messages/${id}`);
}
