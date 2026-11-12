import { CartView } from "../components/saved-lists";
import { priceLabel } from "../components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { listings } from "@/lib/listings";

export default async function CartPage() {
  const t = await getDictionary(await getLocale());
  const prices = Object.fromEntries(listings.map((l) => [l.id, priceLabel(l, t)]));
  const categories = Object.fromEntries(listings.map((l) => [l.id, t.categories[l.category]]));
  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{t.cart.title}</h1>
      <CartView text={t.cart} prices={prices} categories={categories} />
    </main>
  );
}
