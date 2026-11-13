// Reads listings from the Supabase database and turns them into the Listing
// shape the pages use. Without a database (local development), it falls back
// to the sample listings in lib/listings.ts.

import { cache } from "react";
import type { Locale } from "@/i18n/config";
import { SUPABASE_URL, createClient, supabaseConfigured } from "@/lib/supabase/server";
import {
  getListing as getSampleListing,
  getListings as getSampleListings,
  listings as sampleListings,
  type CategorySlug,
  type Listing,
  type Mode,
} from "@/lib/listings";

export const PHOTO_BUCKET = "listing-images";
export const MAX_PHOTOS = 8;

export function photoUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export type DbMode = "sale" | "auction" | "rental" | "booking";

export type Category = {
  id: number;
  parentId: number | null;
  slug: string;
  name: string; // in the visitor's language
  icon: string;
  allowedModes: DbMode[];
  requiresLicense: boolean;
};

type CategoryRow = {
  id: number;
  parent_id: number | null;
  slug: string;
  icon: string | null;
  allowed_modes: DbMode[];
  requires_license: boolean;
  name_en: string;
  name_ar: string;
  name_es?: string;
  name_zh?: string;
  name_fr?: string;
  name_ur?: string;
  names?: Record<string, string>; // translations for the other languages
};

function categoryName(row: CategoryRow, locale: Locale) {
  const key = `name_${locale}` as keyof CategoryRow;
  return (row[key] as string | undefined) || row.names?.[locale] || row.name_en;
}

// The site's category filter (shown on the home and browse pages) uses a few
// friendlier names than the database. Services subcategories count as Services.
const UI_FROM_DB: Record<string, CategorySlug> = { "real-estate": "homes" };
const DB_FROM_UI: Partial<Record<CategorySlug, string>> = { homes: "real-estate" };

export function uiCategory(slug: string, parentSlug: string | null): CategorySlug {
  if (parentSlug === "services") return "services";
  return (UI_FROM_DB[slug] ?? slug) as CategorySlug;
}

const loadCategoryRows = cache(async (): Promise<CategoryRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []) as CategoryRow[];
});

export async function getCategories(locale: Locale): Promise<Category[]> {
  if (!supabaseConfigured()) return [];
  const rows = await loadCategoryRows();
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    slug: r.slug,
    name: categoryName(r, locale),
    icon: r.icon ?? "📦",
    allowedModes: r.allowed_modes,
    requiresLicense: r.requires_license,
  }));
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
export const LISTING_SELECT = `
  id, title, description, status, currency, condition, quantity, city, region, country_code,
  ships, local_pickup, attributes, created_at, seller_id, refund_policy, refund_days,
  category:categories ( * ),
  listing_modes ( mode, price_cents, accepts_offers, start_price_cents, buy_now_price_cents,
                  min_increment_cents, ends_at, rate_cents, rate_unit, deposit_cents, session_minutes ),
  listing_images ( storage_path, position ),
  seller:profiles!listings_seller_id_fkey ( username, rating_avg, rating_count )
`;

type ModeRow = {
  mode: DbMode;
  price_cents: number | null;
  accepts_offers: boolean;
  start_price_cents: number | null;
  buy_now_price_cents: number | null;
  min_increment_cents: number;
  ends_at: string | null;
  rate_cents: number | null;
  rate_unit: "hour" | "day" | "week" | "month" | null;
  deposit_cents: number | null;
  session_minutes: number | null;
};

export type ListingRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  currency: string;
  condition: string;
  quantity: number;
  city: string | null;
  region: string | null;
  country_code: string;
  ships: boolean;
  local_pickup: boolean;
  attributes: Record<string, unknown>;
  refund_policy: "refundable" | "non_refundable" | null;
  refund_days: number | null;
  created_at: string;
  seller_id: string;
  category: (CategoryRow & { parent_id: number | null }) | null;
  listing_modes: ModeRow[];
  listing_images: { storage_path: string; position: number }[];
  seller: { username: string | null; rating_avg: number; rating_count: number } | null;
};

const SERVICES_PARENT = cache(async () => (await loadCategoryRows()).find((c) => c.slug === "services")?.id ?? null);

const MODE_ORDER: DbMode[] = ["sale", "auction", "rental", "booking"];

export async function toListing(row: ListingRow, locale: Locale, highestBid: number | null = null): Promise<Listing> {
  const servicesId = await SERVICES_PARENT();
  const cat = row.category;
  const parentSlug = cat?.parent_id && cat.parent_id === servicesId ? "services" : null;
  const modes = [...row.listing_modes].sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode));
  const get = (m: DbMode) => modes.find((x) => x.mode === m);
  const sale = get("sale");
  const auction = get("auction");
  const rental = get("rental");
  const booking = get("booking");

  const uiModes: Mode[] = [];
  if (sale) uiModes.push("buy");
  if (sale?.accepts_offers) uiModes.push("offer");
  if (auction) uiModes.push("bid");
  if (rental) uiModes.push("rent");
  if (booking) uiModes.push("services");

  // Headline price: what a buyer pays first, in the order the modes are listed.
  let priceCents = 0;
  let priceUnit: Listing["priceUnit"];
  const first = modes[0];
  if (first?.mode === "sale") priceCents = first.price_cents ?? 0;
  else if (first?.mode === "auction") priceCents = highestBid ?? first.start_price_cents ?? 0;
  else if (first?.mode === "rental") {
    priceCents = first.rate_cents ?? 0;
    priceUnit = first.rate_unit ?? undefined;
  } else if (first?.mode === "booking") {
    priceCents = first.price_cents ?? 0;
    priceUnit = "session";
  }

  const images = [...row.listing_images].sort((a, b) => a.position - b.position).map((i) => photoUrl(i.storage_path));
  const location = [row.city, row.region, row.country_code].filter(Boolean).join(", ");

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: cat ? uiCategory(cat.slug, parentSlug) : "services",
    categoryName: cat ? categoryName(cat, locale) : undefined,
    modes: uiModes,
    priceCents,
    priceUnit,
    currency: row.currency,
    location,
    rating: Number(row.seller?.rating_avg ?? 0),
    reviews: row.seller?.rating_count ?? 0,
    emoji: cat?.icon ?? "📦",
    images,
    sellerId: row.seller_id,
    sellerUsername: row.seller?.username ?? undefined,
    status: row.status,
    condition: row.condition,
    createdAt: row.created_at,
    ships: row.ships,
    localPickup: row.local_pickup,
    attributes: row.attributes,
    refundPolicy: row.refund_policy,
    refundDays: row.refund_days,
    sale: sale ? { priceCents: sale.price_cents ?? 0, acceptsOffers: sale.accepts_offers, quantity: row.quantity } : undefined,
    auction: auction
      ? {
          startCents: auction.start_price_cents ?? 0,
          highestCents: highestBid,
          minNextCents:
            highestBid === null ? (auction.start_price_cents ?? 0) : highestBid + auction.min_increment_cents,
          buyNowCents: auction.buy_now_price_cents,
          endsAt: auction.ends_at ?? "",
        }
      : undefined,
    rental: rental
      ? { rateCents: rental.rate_cents ?? 0, unit: rental.rate_unit ?? "day", depositCents: rental.deposit_cents }
      : undefined,
    booking: booking ? { priceCents: booking.price_cents ?? 0, sessionMinutes: booking.session_minutes ?? 60 } : undefined,
  };
}

// Highest bid per auction listing.
async function highestBids(ids: string[]) {
  const result = new Map<string, number>();
  if (ids.length === 0) return result;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bids")
    .select("listing_id, amount_cents")
    .in("listing_id", ids)
    .order("amount_cents", { ascending: false });
  for (const b of data ?? []) {
    if (!result.has(b.listing_id)) result.set(b.listing_id, Number(b.amount_cents));
  }
  return result;
}

async function toListings(rows: ListingRow[], locale: Locale) {
  const auctionIds = rows.filter((r) => r.listing_modes.some((m) => m.mode === "auction")).map((r) => r.id);
  const bids = await highestBids(auctionIds);
  return Promise.all(rows.map((r) => toListing(r, locale, bids.get(r.id) ?? null)));
}

// Characters that have a meaning in database filters are removed from searches.
function cleanSearch(q: string) {
  return q.replace(/[%_*,()"'\\:.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function findListings(
  locale: Locale,
  filters: { mode?: Mode; category?: CategorySlug; q?: string; limit?: number } = {},
): Promise<Listing[]> {
  if (!supabaseConfigured()) {
    const results = getSampleListings(filters);
    return filters.limit ? results.slice(0, filters.limit) : results;
  }
  const supabase = await createClient();

  // A second copy of the modes, used only for filtering, so the card still
  // shows every way the listing is offered.
  const dbMode = filters.mode
    ? ({ buy: "sale", offer: "sale", bid: "auction", rent: "rental", services: "booking" } as const)[filters.mode]
    : null;
  const select = dbMode ? `${LISTING_SELECT}, filter_modes:listing_modes!inner ( mode, accepts_offers )` : LISTING_SELECT;

  let query = supabase.from("listings").select(select).eq("status", "active");
  if (dbMode) {
    query = query.eq("filter_modes.mode", dbMode);
    if (filters.mode === "offer") query = query.eq("filter_modes.accepts_offers", true);
  }
  if (filters.category) {
    const rows = await loadCategoryRows();
    const slug = DB_FROM_UI[filters.category] ?? filters.category;
    const parent = rows.find((r) => r.slug === slug);
    const ids = rows.filter((r) => r.slug === slug || (parent && r.parent_id === parent.id)).map((r) => r.id);
    query = query.in("category_id", ids.length ? ids : [-1]);
  }
  const q = filters.q ? cleanSearch(filters.q) : "";
  if (q) {
    query = query.or(`title.ilike."%${q}%",description.ilike."%${q}%",city.ilike."%${q}%",region.ilike."%${q}%"`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(filters.limit ?? 60);
  if (error) {
    console.error("findListings", error.message);
    return [];
  }
  return toListings((data ?? []) as unknown as ListingRow[], locale);
}

export async function findListing(locale: Locale, id: string): Promise<Listing | null> {
  if (!supabaseConfigured()) return getSampleListing(id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("listings").select(LISTING_SELECT).eq("id", id).maybeSingle();
  if (error) console.error("findListing", error.message);
  if (!data) return null;
  const [listing] = await toListings([data as unknown as ListingRow], locale);
  return listing;
}

export async function findListingsByIds(locale: Locale, ids: string[]): Promise<Listing[]> {
  if (!supabaseConfigured()) return sampleListings.filter((l) => ids.includes(l.id));
  const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (valid.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("listings").select(LISTING_SELECT).in("id", valid);
  if (error) console.error("findListingsByIds", error.message);
  return toListings((data ?? []) as unknown as ListingRow[], locale);
}

export async function findSellerListings(locale: Locale, sellerId: string): Promise<Listing[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("seller_id", sellerId)
    .neq("status", "removed")
    .order("created_at", { ascending: false });
  if (error) console.error("findSellerListings", error.message);
  return toListings((data ?? []) as unknown as ListingRow[], locale);
}
