"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PHOTO_BUCKET } from "@/lib/catalog";
import { requireMember } from "@/lib/member";

export type ListingErrorCode =
  | "bidLow"
  | "auctionClosed"
  | "ownListing"
  | "datesTaken"
  | "dates"
  | "amount"
  | "notAvailable"
  | "message"
  | "generic";

export type ListingActionState = { error?: ListingErrorCode; ok?: boolean };

const REPORT_REASONS = ["prohibited_item", "scam_or_fraud", "counterfeit", "wrong_category", "offensive", "unsafe", "other"];
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

function cents(value: string): number | null {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0 || n > 1_000_000_000) return null;
  return Math.round(n * 100);
}

// Loads the listing and checks the visitor isn't its seller.
async function loadListing(listingId: string) {
  const member = await requireMember();
  if (!isId(listingId)) return { member, listing: null };
  const { data: listing } = await member.supabase
    .from("listings")
    .select("id, seller_id, status, listing_modes ( mode, accepts_offers, session_minutes )")
    .eq("id", listingId)
    .maybeSingle();
  return { member, listing };
}

export async function placeBid(listingId: string, _prev: ListingActionState, fd: FormData): Promise<ListingActionState> {
  const { member, listing } = await loadListing(listingId);
  if (!listing || listing.status !== "active") return { error: "notAvailable" };
  if (listing.seller_id === member.user.id) return { error: "ownListing" };
  const amount = cents(text(fd, "amount"));
  if (!amount) return { error: "amount" };

  const { error } = await member.supabase
    .from("bids")
    .insert({ listing_id: listingId, bidder_id: member.user.id, amount_cents: amount });
  if (error) {
    const msg = error.message;
    if (/at least/i.test(msg)) return { error: "bidLow" };
    if (/not open|not active|not an auction/i.test(msg)) return { error: "auctionClosed" };
    if (/own auction/i.test(msg)) return { error: "ownListing" };
    console.error("placeBid", msg);
    return { error: "generic" };
  }
  revalidatePath(`/listing/${listingId}`);
  return { ok: true };
}

export async function makeOffer(listingId: string, _prev: ListingActionState, fd: FormData): Promise<ListingActionState> {
  const { member, listing } = await loadListing(listingId);
  if (!listing || listing.status !== "active") return { error: "notAvailable" };
  if (listing.seller_id === member.user.id) return { error: "ownListing" };
  if (!listing.listing_modes.some((m) => m.mode === "sale" && m.accepts_offers)) return { error: "notAvailable" };
  const amount = cents(text(fd, "amount"));
  if (!amount) return { error: "amount" };

  const { error } = await member.supabase.from("offers").insert({
    listing_id: listingId,
    buyer_id: member.user.id,
    amount_cents: amount,
    message: text(fd, "message").slice(0, 1000) || null,
  });
  if (error) {
    console.error("makeOffer", error.message);
    return { error: "generic" };
  }
  return { ok: true };
}

// Rentals send a start and end; bookings send a start, and the session length
// comes from the listing. Times arrive as ISO strings made in the browser, so
// they're in the visitor's own time zone.
export async function requestReservation(
  listingId: string,
  mode: "rental" | "booking",
  _prev: ListingActionState,
  fd: FormData,
): Promise<ListingActionState> {
  const { member, listing } = await loadListing(listingId);
  if (!listing || listing.status !== "active") return { error: "notAvailable" };
  if (listing.seller_id === member.user.id) return { error: "ownListing" };
  const listingMode = listing.listing_modes.find((m) => m.mode === mode);
  if (!listingMode) return { error: "notAvailable" };

  const start = new Date(text(fd, "start"));
  let end: Date;
  if (mode === "booking") end = new Date(start.getTime() + (listingMode.session_minutes ?? 60) * 60000);
  else end = new Date(text(fd, "end"));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || start.getTime() < Date.now() - 3600000) {
    return { error: "dates" };
  }

  const { error } = await member.supabase.from("reservations").insert({
    listing_id: listingId,
    renter_id: member.user.id,
    mode,
    period: `[${start.toISOString()},${end.toISOString()})`,
    notes: text(fd, "notes").slice(0, 1000) || null,
  });
  if (error) {
    if (error.code === "23P01") return { error: "datesTaken" };
    console.error("requestReservation", error.message);
    return { error: "generic" };
  }
  return { ok: true };
}

// Starts (or continues) a conversation with the seller about this listing.
export async function messageSeller(listingId: string, _prev: ListingActionState, fd: FormData): Promise<ListingActionState> {
  const { member, listing } = await loadListing(listingId);
  if (!listing) return { error: "notAvailable" };
  if (listing.seller_id === member.user.id) return { error: "ownListing" };
  const body = text(fd, "body").slice(0, 5000);
  if (!body) return { error: "message" };

  const supabase = member.supabase;
  let { data: convo } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", member.user.id)
    .maybeSingle();
  if (!convo) {
    const created = await supabase
      .from("conversations")
      .insert({ listing_id: listingId, buyer_id: member.user.id, seller_id: listing.seller_id })
      .select("id")
      .single();
    if (created.error) {
      console.error("messageSeller", created.error.message);
      return { error: "generic" };
    }
    convo = created.data;
  }
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: convo.id, sender_id: member.user.id, body });
  if (error) {
    console.error("messageSeller", error.message);
    return { error: "generic" };
  }
  redirect(`/messages/${convo.id}`);
}

export async function reportListing(listingId: string, _prev: ListingActionState, fd: FormData): Promise<ListingActionState> {
  const member = await requireMember();
  const reason = text(fd, "reason");
  if (!isId(listingId) || !REPORT_REASONS.includes(reason)) return { error: "generic" };
  const { error } = await member.supabase.from("reports").insert({
    reporter_id: member.user.id,
    listing_id: listingId,
    reason,
    details: text(fd, "details").slice(0, 2000) || null,
  });
  if (error) {
    console.error("reportListing", error.message);
    return { error: "generic" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Seller tools
// ---------------------------------------------------------------------------
export async function setListingStatus(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const status = text(fd, "status");
  if (!isId(id) || !["active", "paused", "sold"].includes(status)) return;
  await member.supabase.from("listings").update({ status }).eq("id", id).eq("seller_id", member.user.id);
  revalidatePath(`/listing/${id}`);
  revalidatePath("/account/selling");
  revalidatePath("/browse");
  revalidatePath("/");
}

export async function deleteListing(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  if (!isId(id)) return;
  const supabase = member.supabase;
  const { data: images } = await supabase.from("listing_images").select("storage_path").eq("listing_id", id);
  const { error } = await supabase.from("listings").delete().eq("id", id).eq("seller_id", member.user.id);
  if (error) {
    // Listings that already have orders can't be deleted; hide them instead.
    await supabase.from("listings").update({ status: "removed" }).eq("id", id).eq("seller_id", member.user.id);
  } else if (images && images.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(images.map((i) => i.storage_path));
  }
  revalidatePath("/account/selling");
  revalidatePath("/browse");
  revalidatePath("/");
  redirect("/account/selling");
}

export async function answerOffer(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const status = text(fd, "status");
  if (!isId(id) || !["accepted", "declined", "withdrawn"].includes(status)) return;
  await member.supabase.from("offers").update({ status }).eq("id", id);
  revalidatePath("/account/selling");
  revalidatePath("/account/buying");
}

export async function answerReservation(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const status = text(fd, "status");
  if (!isId(id) || !["confirmed", "cancelled", "completed"].includes(status)) return;
  await member.supabase.from("reservations").update({ status }).eq("id", id);
  revalidatePath("/account/selling");
  revalidatePath("/account/buying");
}
