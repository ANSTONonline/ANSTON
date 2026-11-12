import Link from "next/link";
import { AddToCartButton, FavoriteButton } from "./list-buttons";
import { formatPrice, type Listing } from "@/lib/listings";
import type { Dictionary } from "@/i18n/server";

export function priceLabel(listing: Listing, t: Dictionary) {
  const unit = {
    month: t.listing.perMonth,
    day: t.listing.perDay,
    hour: t.listing.perHour,
    session: t.listing.perSession,
  };
  return formatPrice(listing.priceCents) + (listing.priceUnit ? unit[listing.priceUnit] : "");
}

export function modeLabel(listing: Listing, t: Dictionary) {
  const m = listing.modes[0];
  if (m === "buy" || m === "offer") return t.featured.buyNow;
  if (m === "bid") return t.featured.bid;
  if (m === "rent") return t.featured.forRent;
  return t.browse.services;
}

// The main action for listings that can't simply be added to the cart.
export function actionLabel(listing: Listing, t: Dictionary) {
  const m = listing.modes[0];
  if (m === "bid") return t.listing.placeBid;
  if (m === "rent") return t.listing.rentNow;
  if (m === "services") return t.listing.bookNow;
  return t.listing.makeOffer;
}

export default function ListingCard({ listing, t }: { listing: Listing; t: Dictionary }) {
  return (
    <div className="border rounded-xl overflow-hidden hover:shadow-md transition flex flex-col">
      <div className="relative h-40 bg-gray-100 flex items-center justify-center text-5xl">
        <Link href={`/listing/${listing.id}`} className="absolute inset-0" aria-label={listing.title} />
        <span aria-hidden="true">{listing.emoji}</span>
        <span className="absolute top-2 start-2 bg-[#7A1E2B] text-white text-xs px-2 py-1 rounded">
          {modeLabel(listing, t)}
        </span>
        <FavoriteButton
          id={listing.id}
          saveLabel={t.featured.save}
          savedLabel={t.featured.saved}
          className="absolute top-2 end-2 w-8 h-8"
        />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-gray-500 mb-1">{t.categories[listing.category]}</p>
        <Link href={`/listing/${listing.id}`} className="font-semibold mb-1 hover:text-[#7A1E2B]" dir="ltr">
          {listing.title}
        </Link>
        <p className="text-sm text-gray-600 mb-1">
          ⭐ {listing.rating} ({listing.reviews} {t.featured.reviews})
        </p>
        <p className="text-sm text-gray-500 mb-3" dir="ltr">📍 {listing.location}</p>
        <div className="flex items-center justify-between gap-2 mt-auto">
          <span className="font-bold" dir="ltr">{priceLabel(listing, t)}</span>
          {listing.modes.includes("buy") ? (
            <AddToCartButton
              id={listing.id}
              label={t.featured.addToCart}
              addedLabel={t.featured.inCart}
              className="text-xs px-3 py-2"
            />
          ) : (
            <Link
              href={`/listing/${listing.id}`}
              className="border border-[#7A1E2B] text-[#7A1E2B] text-xs px-3 py-2 rounded-lg"
            >
              {actionLabel(listing, t)}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
