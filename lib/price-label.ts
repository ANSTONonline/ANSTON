import type { Dictionary } from "@/i18n/server";
import { formatPrice, type Listing } from "@/lib/listings";

// "$1,200/month" style price shown on cards.
export function priceLabel(listing: Listing, t: Dictionary) {
  const unit = {
    month: t.listing.perMonth,
    week: t.listing.perWeek,
    day: t.listing.perDay,
    hour: t.listing.perHour,
    session: t.listing.perSession,
  };
  return formatPrice(listing.priceCents, listing.currency) + (listing.priceUnit ? unit[listing.priceUnit] : "");
}
