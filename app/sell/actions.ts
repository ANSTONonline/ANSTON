"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "@/i18n/server";
import { MAX_PHOTOS, PHOTO_BUCKET, getCategories, type DbMode } from "@/lib/catalog";
import { requireMember } from "@/lib/member";
import { AUCTION_DAYS, CONDITIONS, CURRENCIES, RATE_UNITS, SESSION_MINUTES } from "@/lib/sell-options";

export type SellErrorCode =
  | "title"
  | "category"
  | "description"
  | "modes"
  | "price"
  | "photos"
  | "food"
  | "license"
  | "location"
  | "generic";

export type SellState = { error?: SellErrorCode; values?: Record<string, string> };

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const checked = (fd: FormData, key: string) => fd.get(key) === "on";

// "12.50" -> 1250. Returns null for empty, zero or invalid amounts.
function cents(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000_000) return null;
  return Math.round(n * 100);
}

// How much each new bid must beat the last one by, based on the starting bid.
function bidStep(startCents: number) {
  const dollars = startCents / 100;
  if (dollars < 100) return 100; // 1.00
  if (dollars < 500) return 500;
  if (dollars < 1000) return 1000;
  if (dollars < 2500) return 2500;
  if (dollars < 5000) return 5000;
  return 10000; // 100.00
}

// Every column a listing_modes row can have, so an update also clears
// values a mode no longer uses (for example a removed buy-it-now price).
type ModeRow = {
  mode: DbMode;
  price_cents: number | null;
  accepts_offers: boolean;
  start_price_cents: number | null;
  buy_now_price_cents: number | null;
  min_increment_cents: number;
  ends_at: string | null;
  rate_cents: number | null;
  rate_unit: string | null;
  deposit_cents: number | null;
  session_minutes: number | null;
};

const emptyMode = (mode: DbMode): ModeRow => ({
  mode,
  price_cents: null,
  accepts_offers: false,
  start_price_cents: null,
  buy_now_price_cents: null,
  min_increment_cents: 100,
  ends_at: null,
  rate_cents: null,
  rate_unit: null,
  deposit_cents: null,
  session_minutes: null,
});

type ParsedListing = {
  fields: Record<string, unknown>;
  modes: ModeRow[];
  photos: string[];
};

// Reads and checks the List an item / Edit listing form. `existingAuctionEnd`
// lets an edit keep the auction's current end time ("keep" in the length menu).
async function readListingForm(
  fd: FormData,
  userId: string,
  existingAuctionEnd: string | null,
): Promise<{ error: SellErrorCode } | ParsedListing> {
  const locale = await getLocale();
  const categories = await getCategories(locale);
  const category = categories.find((c) => String(c.id) === text(fd, "category"));
  if (!category || category.slug === "services") return { error: "category" };
  const isFood = category.slug === "food";

  const title = text(fd, "title");
  if (title.length < 3 || title.length > 140) return { error: "title" };
  const description = text(fd, "description");
  if (description.length > 10000) return { error: "description" };

  const country = text(fd, "country").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { error: "location" };

  const currency = CURRENCIES.includes(text(fd, "currency")) ? text(fd, "currency") : "USD";
  const condition = (CONDITIONS as readonly string[]).includes(text(fd, "condition")) ? text(fd, "condition") : "not_applicable";
  const quantity = Math.min(Math.max(parseInt(text(fd, "quantity"), 10) || 1, 1), 10000);

  // Photos were uploaded straight to storage by the form; only accept files
  // in this person's own folder.
  const photos = fd
    .getAll("photo")
    .map(String)
    .filter((p) => p.startsWith(`${userId}/`) && !p.includes(".."));
  if (photos.length > MAX_PHOTOS) return { error: "photos" };

  if (category.requiresLicense && !checked(fd, "license_confirm")) return { error: "license" };
  const attributes: Record<string, unknown> = {};
  if (isFood) {
    if (!checked(fd, "food_rules")) return { error: "food" };
    attributes.homemade = checked(fd, "homemade");
    const allergens = text(fd, "allergens").slice(0, 300);
    if (allergens) attributes.allergens = allergens;
  }

  // Ways to offer it.
  const modes: ModeRow[] = [];
  const allowed = (m: DbMode) => category.allowedModes.includes(m) && checked(fd, `mode_${m}`);
  if (allowed("sale")) {
    const price = cents(text(fd, "sale_price"));
    if (!price) return { error: "price" };
    modes.push({ ...emptyMode("sale"), price_cents: price, accepts_offers: checked(fd, "sale_offers") });
  }
  if (allowed("auction")) {
    const start = cents(text(fd, "auction_start"));
    if (!start) return { error: "price" };
    const buyNow = cents(text(fd, "auction_buy_now"));
    if (buyNow !== null && buyNow <= start) return { error: "price" };
    const daysText = text(fd, "auction_days");
    const endsAt =
      daysText === "keep" && existingAuctionEnd
        ? existingAuctionEnd
        : new Date(Date.now() + (AUCTION_DAYS.includes(Number(daysText)) ? Number(daysText) : 7) * 86400000).toISOString();
    modes.push({
      ...emptyMode("auction"),
      start_price_cents: start,
      buy_now_price_cents: buyNow,
      min_increment_cents: bidStep(start),
      ends_at: endsAt,
    });
  }
  if (allowed("rental")) {
    const rate = cents(text(fd, "rental_rate"));
    if (!rate) return { error: "price" };
    const unit = (RATE_UNITS as readonly string[]).includes(text(fd, "rental_unit")) ? text(fd, "rental_unit") : "day";
    const depositText = text(fd, "rental_deposit");
    modes.push({ ...emptyMode("rental"), rate_cents: rate, rate_unit: unit, deposit_cents: depositText ? cents(depositText) : null });
  }
  if (allowed("booking")) {
    const price = cents(text(fd, "booking_price"));
    if (!price) return { error: "price" };
    const minutes = SESSION_MINUTES.includes(Number(text(fd, "booking_minutes"))) ? Number(text(fd, "booking_minutes")) : 60;
    modes.push({ ...emptyMode("booking"), price_cents: price, session_minutes: minutes });
  }

  return {
    fields: {
      category_id: category.id,
      title,
      description,
      condition: category.allowedModes.includes("booking") || isFood ? "not_applicable" : condition,
      currency,
      quantity: modes.some((m) => m.mode === "sale") ? quantity : 1,
      attributes,
      country_code: country,
      region: text(fd, "region").slice(0, 100) || null,
      city: text(fd, "city").slice(0, 100) || null,
      ships: checked(fd, "ships"),
      local_pickup: checked(fd, "local_pickup"),
    },
    modes,
    photos,
  };
}

// What the person typed, so the form can show it again after an error.
function typedValues(fd: FormData) {
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && k !== "photo") values[k] = v;
  return values;
}

export async function createListing(_prev: SellState, fd: FormData): Promise<SellState> {
  const { supabase, user, profile } = await requireMember();
  const values = typedValues(fd);
  if (profile?.is_suspended) return { error: "generic", values };

  const parsed = await readListingForm(fd, user.id, null);
  if ("error" in parsed) return { error: parsed.error, values };
  if (parsed.modes.length === 0) return { error: "modes", values };

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({ ...parsed.fields, seller_id: user.id, language: await getLocale(), status: "active" })
    .select("id")
    .single();
  if (error || !listing) {
    console.error("createListing", error?.message);
    return { error: "generic", values };
  }

  const { error: modeError } = await supabase
    .from("listing_modes")
    .insert(parsed.modes.map((m) => ({ ...m, listing_id: listing.id })));
  if (modeError) {
    console.error("createListing modes", modeError.message);
    await supabase.from("listings").delete().eq("id", listing.id);
    return { error: "generic", values };
  }

  if (parsed.photos.length > 0) {
    const { error: photoError } = await supabase
      .from("listing_images")
      .insert(parsed.photos.map((path, position) => ({ listing_id: listing.id, storage_path: path, position })));
    if (photoError) console.error("createListing photos", photoError.message);
  }

  revalidatePath("/");
  revalidatePath("/browse");
  redirect(`/listing/${listing.id}?created=1`);
}

// Saves changes to an existing listing. An auction that already has bids
// keeps its prices and end time (the database enforces this too), and can't
// be removed, so bidders aren't treated unfairly.
export async function updateListing(listingId: string, _prev: SellState, fd: FormData): Promise<SellState> {
  const { supabase, user } = await requireMember();
  const values = typedValues(fd);
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) notFound();

  const { data: current } = await supabase
    .from("listings")
    .select("id, seller_id, listing_modes ( * ), listing_images ( storage_path )")
    .eq("id", listingId)
    .maybeSingle();
  if (!current || current.seller_id !== user.id) notFound();

  const existingModes = (current.listing_modes ?? []) as (ModeRow & { id: string })[];
  const existingAuction = existingModes.find((m) => m.mode === "auction") ?? null;
  const { count: bidCount } = await supabase
    .from("bids")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);
  const auctionLocked = Boolean(existingAuction && (bidCount ?? 0) > 0);

  const parsed = await readListingForm(fd, user.id, existingAuction?.ends_at ?? null);
  if ("error" in parsed) return { error: parsed.error, values };

  // A locked auction stays exactly as it is.
  let modes = parsed.modes;
  if (auctionLocked && existingAuction) {
    const { id: _id, ...kept } = existingAuction;
    void _id;
    modes = [...modes.filter((m) => m.mode !== "auction"), kept as ModeRow];
  }
  if (modes.length === 0) return { error: "modes", values };

  const { error } = await supabase.from("listings").update(parsed.fields).eq("id", listingId).eq("seller_id", user.id);
  if (error) {
    console.error("updateListing", error.message);
    return { error: "generic", values };
  }

  // Ways to offer it: update the ones kept, add new ones, remove the rest.
  const keepModes = new Set(modes.map((m) => m.mode));
  const removed = existingModes.filter((m) => !keepModes.has(m.mode)).map((m) => m.id);
  if (removed.length > 0) {
    const { error: removeError } = await supabase.from("listing_modes").delete().in("id", removed);
    if (removeError) console.error("updateListing remove modes", removeError.message);
  }
  for (const m of modes) {
    if (auctionLocked && m.mode === "auction") continue;
    const existing = existingModes.find((e) => e.mode === m.mode);
    const { error: modeError } = existing
      ? await supabase.from("listing_modes").update(m).eq("id", existing.id)
      : await supabase.from("listing_modes").insert({ ...m, listing_id: listingId });
    if (modeError) {
      console.error("updateListing modes", modeError.message);
      return { error: "generic", values };
    }
  }

  // Photos: save the new order, and delete files that were taken out.
  const before = (current.listing_images ?? []).map((i: { storage_path: string }) => i.storage_path);
  await supabase.from("listing_images").delete().eq("listing_id", listingId);
  if (parsed.photos.length > 0) {
    const { error: photoError } = await supabase
      .from("listing_images")
      .insert(parsed.photos.map((path, position) => ({ listing_id: listingId, storage_path: path, position })));
    if (photoError) console.error("updateListing photos", photoError.message);
  }
  const dropped = before.filter((p: string) => !parsed.photos.includes(p) && p.startsWith(`${user.id}/`));
  if (dropped.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(dropped);

  revalidatePath(`/listing/${listingId}`);
  revalidatePath("/account/selling");
  revalidatePath("/browse");
  revalidatePath("/");
  redirect(`/listing/${listingId}?updated=1`);
}

// Removes a photo the person uploaded but then took out of the form.
export async function discardPhoto(path: string) {
  const { supabase, user } = await requireMember();
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}
