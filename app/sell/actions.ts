"use server";

import { redirect } from "next/navigation";
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

export async function createListing(_prev: SellState, fd: FormData): Promise<SellState> {
  const { supabase, user, profile } = await requireMember();
  const locale = await getLocale();

  // Keep what the person typed so the form can show it again after an error.
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && k !== "photo") values[k] = v;
  const fail = (error: SellErrorCode): SellState => ({ error, values });

  if (profile?.is_suspended) return fail("generic");

  const categories = await getCategories(locale);
  const category = categories.find((c) => String(c.id) === text(fd, "category"));
  if (!category || category.slug === "services") return fail("category");
  const isFood = category.slug === "food";

  const title = text(fd, "title");
  if (title.length < 3 || title.length > 140) return fail("title");
  const description = text(fd, "description");
  if (description.length > 10000) return fail("description");

  const country = text(fd, "country").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return fail("location");
  const city = text(fd, "city").slice(0, 100) || null;
  const region = text(fd, "region").slice(0, 100) || null;

  const currency = CURRENCIES.includes(text(fd, "currency")) ? text(fd, "currency") : "USD";
  const condition = (CONDITIONS as readonly string[]).includes(text(fd, "condition")) ? text(fd, "condition") : "not_applicable";
  const quantity = Math.min(Math.max(parseInt(text(fd, "quantity"), 10) || 1, 1), 10000);

  // Photos were uploaded straight to storage by the form; only accept files
  // in this person's own folder.
  const photos = fd
    .getAll("photo")
    .map(String)
    .filter((p) => p.startsWith(`${user.id}/`) && !p.includes(".."));
  if (photos.length > MAX_PHOTOS) return fail("photos");

  if (category.requiresLicense && !checked(fd, "license_confirm")) return fail("license");
  const attributes: Record<string, unknown> = {};
  if (isFood) {
    if (!checked(fd, "food_rules")) return fail("food");
    attributes.homemade = checked(fd, "homemade");
    const allergens = text(fd, "allergens").slice(0, 300);
    if (allergens) attributes.allergens = allergens;
  }

  // Ways to offer it.
  const modes: Record<string, unknown>[] = [];
  const allowed = (m: DbMode) => category.allowedModes.includes(m) && checked(fd, `mode_${m}`);
  if (allowed("sale")) {
    const price = cents(text(fd, "sale_price"));
    if (!price) return fail("price");
    modes.push({ mode: "sale", price_cents: price, accepts_offers: checked(fd, "sale_offers") });
  }
  if (allowed("auction")) {
    const start = cents(text(fd, "auction_start"));
    if (!start) return fail("price");
    const buyNow = cents(text(fd, "auction_buy_now"));
    if (buyNow !== null && buyNow <= start) return fail("price");
    const days = AUCTION_DAYS.includes(Number(text(fd, "auction_days"))) ? Number(text(fd, "auction_days")) : 7;
    modes.push({
      mode: "auction",
      start_price_cents: start,
      buy_now_price_cents: buyNow,
      min_increment_cents: bidStep(start),
      ends_at: new Date(Date.now() + days * 86400000).toISOString(),
    });
  }
  if (allowed("rental")) {
    const rate = cents(text(fd, "rental_rate"));
    if (!rate) return fail("price");
    const unit = (RATE_UNITS as readonly string[]).includes(text(fd, "rental_unit")) ? text(fd, "rental_unit") : "day";
    const depositText = text(fd, "rental_deposit");
    const deposit = depositText ? cents(depositText) : null;
    modes.push({ mode: "rental", rate_cents: rate, rate_unit: unit, deposit_cents: deposit });
  }
  if (allowed("booking")) {
    const price = cents(text(fd, "booking_price"));
    if (!price) return fail("price");
    const minutes = SESSION_MINUTES.includes(Number(text(fd, "booking_minutes")))
      ? Number(text(fd, "booking_minutes"))
      : 60;
    modes.push({ mode: "booking", price_cents: price, session_minutes: minutes });
  }
  if (modes.length === 0) return fail("modes");

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      category_id: category.id,
      title,
      description,
      language: locale,
      condition: category.allowedModes.includes("booking") || isFood ? "not_applicable" : condition,
      status: "active",
      currency,
      quantity: modes.some((m) => m.mode === "sale") ? quantity : 1,
      attributes,
      country_code: country,
      region,
      city,
      ships: checked(fd, "ships"),
      local_pickup: checked(fd, "local_pickup"),
    })
    .select("id")
    .single();
  if (error || !listing) {
    console.error("createListing", error?.message);
    return fail("generic");
  }

  const { error: modeError } = await supabase
    .from("listing_modes")
    // Columns a row leaves out get their database default, not null.
    .insert(
      modes.map((m) => ({ ...m, listing_id: listing.id })),
      { defaultToNull: false },
    );
  if (modeError) {
    console.error("createListing modes", modeError.message);
    await supabase.from("listings").delete().eq("id", listing.id);
    return fail("generic");
  }

  if (photos.length > 0) {
    const { error: photoError } = await supabase
      .from("listing_images")
      .insert(photos.map((path, position) => ({ listing_id: listing.id, storage_path: path, position })));
    if (photoError) console.error("createListing photos", photoError.message);
  }

  revalidatePath("/");
  revalidatePath("/browse");
  redirect(`/listing/${listing.id}?created=1`);
}

// Removes a photo the person uploaded but then took out of the form.
export async function discardPhoto(path: string) {
  const { supabase, user } = await requireMember();
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}
