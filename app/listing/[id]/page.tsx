import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton, FavoriteButton } from "../../components/list-buttons";
import { actionLabel, priceLabel } from "../../components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { getListing } from "@/lib/listings";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = getListing(id);
  if (!listing) notFound();
  const t = await getDictionary(await getLocale());
  const canBuy = listing.modes.includes("buy");
  const otherModes = listing.modes.filter((m) => m !== "buy");

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      <Link href="/browse" className="text-sm text-[#7A1E2B] hover:underline">
        {t.listing.back}
      </Link>

      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="relative h-72 md:h-96 bg-gray-100 rounded-xl flex items-center justify-center text-8xl">
          <span aria-hidden="true">{listing.emoji}</span>
          <FavoriteButton
            id={listing.id}
            saveLabel={t.featured.save}
            savedLabel={t.featured.saved}
            className="absolute top-3 end-3 w-10 h-10"
          />
        </div>

        <div>
          <p className="text-sm text-gray-500 mb-1">
            <Link href={`/browse?category=${listing.category}`} className="hover:underline">
              {t.categories[listing.category]}
            </Link>
          </p>
          <h1 className="text-3xl font-bold mb-2" dir="ltr">{listing.title}</h1>
          <p className="text-gray-600 mb-4">
            ⭐ {listing.rating} ({listing.reviews} {t.featured.reviews})
          </p>
          <p className="text-3xl font-bold mb-6" dir="ltr">{priceLabel(listing, t)}</p>

          <div className="flex flex-col gap-3 mb-6">
            {canBuy && (
              <AddToCartButton
                id={listing.id}
                label={t.featured.addToCart}
                addedLabel={t.featured.inCart}
                className="py-3 font-medium"
              />
            )}
            {otherModes.length > 0 && (
              <>
                <Link
                  href="/account"
                  className="border border-[#7A1E2B] text-[#7A1E2B] rounded-lg py-3 text-center font-medium"
                >
                  {actionLabel({ ...listing, modes: otherModes }, t)}
                </Link>
                <p className="text-xs text-gray-500">{t.listing.actionSoon}</p>
              </>
            )}
          </div>

          <h2 className="font-semibold mb-1">{t.listing.description}</h2>
          <p className="text-gray-700 mb-4" dir="ltr">{listing.description}</p>
          <h2 className="font-semibold mb-1">{t.listing.location}</h2>
          <p className="text-gray-700" dir="ltr">📍 {listing.location}</p>
        </div>
      </div>
    </main>
  );
}
