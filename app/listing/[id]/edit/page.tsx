import { notFound } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCategories, photoUrl } from "@/lib/catalog";
import { requireMember } from "@/lib/member";
import ListingForm, { type EditingListing } from "../../../sell/listing-form";

type ModeRow = {
  mode: "sale" | "auction" | "rental" | "booking";
  price_cents: number | null;
  accepts_offers: boolean;
  start_price_cents: number | null;
  buy_now_price_cents: number | null;
  ends_at: string | null;
  rate_cents: number | null;
  rate_unit: string | null;
  deposit_cents: number | null;
  session_minutes: number | null;
};

const money = (c: number | null) => (c ? (c / 100).toFixed(2) : "");

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const { supabase, user } = await requireMember();

  const { data: listing } = await supabase
    .from("listings")
    .select(
      `id, seller_id, category_id, title, description, condition, currency, quantity, attributes,
       country_code, region, city, ships, local_pickup,
       listing_modes ( * ), listing_images ( storage_path, position )`,
    )
    .eq("id", id)
    .maybeSingle();
  // Only the seller can edit their listing.
  if (!listing || listing.seller_id !== user.id) notFound();

  const modes = (listing.listing_modes ?? []) as ModeRow[];
  const get = (m: ModeRow["mode"]) => modes.find((x) => x.mode === m);
  const sale = get("sale");
  const auction = get("auction");
  const rental = get("rental");
  const booking = get("booking");
  const attributes = (listing.attributes ?? {}) as Record<string, unknown>;

  const { count: bidCount } = await supabase
    .from("bids")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", id);

  const on = (b: boolean | undefined) => (b ? "on" : "");
  const values: Record<string, string> = {
    category: String(listing.category_id),
    title: listing.title,
    description: listing.description ?? "",
    condition: listing.condition === "not_applicable" ? "good" : listing.condition,
    currency: listing.currency,
    quantity: String(listing.quantity ?? 1),
    country: listing.country_code,
    region: listing.region ?? "",
    city: listing.city ?? "",
    ships: on(listing.ships),
    local_pickup: on(listing.local_pickup),
    mode_sale: on(Boolean(sale)),
    sale_price: money(sale?.price_cents ?? null),
    sale_offers: on(sale?.accepts_offers),
    mode_auction: on(Boolean(auction)),
    auction_start: money(auction?.start_price_cents ?? null),
    auction_buy_now: money(auction?.buy_now_price_cents ?? null),
    auction_days: auction ? "keep" : "7",
    mode_rental: on(Boolean(rental)),
    rental_rate: money(rental?.rate_cents ?? null),
    rental_unit: rental?.rate_unit ?? "day",
    rental_deposit: money(rental?.deposit_cents ?? null),
    mode_booking: on(Boolean(booking)),
    booking_price: money(booking?.price_cents ?? null),
    booking_minutes: String(booking?.session_minutes ?? 60),
    homemade: on(attributes.homemade === true),
    allergens: typeof attributes.allergens === "string" ? attributes.allergens : "",
    // They confirmed these when they first listed it.
    food_rules: "on",
    license_confirm: "on",
  };

  const editing: EditingListing = {
    listingId: id,
    values,
    photos: [...(listing.listing_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ path: i.storage_path, url: photoUrl(i.storage_path) })),
    auctionLocked: Boolean(auction && (bidCount ?? 0) > 0),
    auctionEndsAt: auction?.ends_at ?? null,
  };

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-8 text-center">{t.sell.editTitle}</h1>
      <ListingForm
        text={t.sell}
        categories={await getCategories(locale)}
        userId={user.id}
        locale={locale}
        editing={editing}
      />
    </main>
  );
}
