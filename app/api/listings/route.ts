import { priceLabel } from "@/lib/price-label";
import { getDictionary, getLocale } from "@/i18n/server";
import { findListingsByIds } from "@/lib/catalog";

// Card details for the listings saved in the visitor's cart or favorites
// (those lists live in the browser, so the page asks for the details here).
// GET /api/listings?ids=a,b,c
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const listings = await findListingsByIds(locale, ids);
  return Response.json(
    listings
      .filter((l) => !l.status || l.status === "active" || l.status === "sold")
      .map((l) => ({
        id: l.id,
        title: l.title,
        image: l.images[0] ?? null,
        emoji: l.emoji,
        category: l.categoryName ?? t.categories[l.category],
        price: priceLabel(l, t),
        priceCents: l.sale?.priceCents ?? l.priceCents,
        currency: l.currency,
        location: l.location,
        sold: l.status === "sold",
      })),
  );
}
