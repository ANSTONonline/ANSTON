"use client";

import Link from "next/link";
import { useList } from "./store";
import { FavoriteButton } from "./list-buttons";
import { formatPrice, listings } from "@/lib/listings";

type CartText = {
  title: string;
  empty: string;
  browse: string;
  remove: string;
  total: string;
  checkout: string;
  checkoutSoon: string;
};

// The cart page: listings added with "Add to Cart", with a total.
export function CartView({
  text,
  prices,
  categories,
}: {
  text: CartText;
  prices: Record<string, string>;
  categories: Record<string, string>;
}) {
  const cart = useList("cart");
  const items = listings.filter((l) => cart.items.includes(l.id));
  const total = items.reduce((sum, l) => sum + l.priceCents, 0);

  if (items.length === 0) {
    return (
      <div className="text-center py-16 border rounded-xl bg-gray-50">
        <p className="text-gray-600 mb-4">{text.empty}</p>
        <Link href="/browse" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
          {text.browse}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-8">
      <ul className="md:col-span-2 divide-y border rounded-xl">
        {items.map((l) => (
          <li key={l.id} className="flex items-center gap-4 p-4">
            <span className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-3xl" aria-hidden="true">
              {l.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">{categories[l.id]}</p>
              <Link href={`/listing/${l.id}`} className="font-semibold hover:text-[#7A1E2B]" dir="ltr">
                {l.title}
              </Link>
              <p className="text-sm text-gray-500" dir="ltr">{l.location}</p>
            </div>
            <div className="text-end">
              <p className="font-bold" dir="ltr">{prices[l.id]}</p>
              <button type="button" onClick={() => cart.remove(l.id)} className="text-sm text-[#7A1E2B] hover:underline">
                {text.remove}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="border rounded-xl p-6 h-fit">
        <div className="flex justify-between font-bold text-lg mb-4">
          <span>{text.total}</span>
          <span dir="ltr">{formatPrice(total)}</span>
        </div>
        <button type="button" disabled className="w-full bg-[#7A1E2B] text-white py-3 rounded-lg font-medium opacity-60 cursor-not-allowed">
          {text.checkout}
        </button>
        <p className="text-xs text-gray-500 mt-3">{text.checkoutSoon}</p>
      </div>
    </div>
  );
}

// The saved listings page.
export function FavoritesView({
  text,
  prices,
  categories,
}: {
  text: { empty: string; browse: string; save: string; saved: string };
  prices: Record<string, string>;
  categories: Record<string, string>;
}) {
  const favorites = useList("favorites");
  const items = listings.filter((l) => favorites.items.includes(l.id));

  if (items.length === 0) {
    return (
      <div className="text-center py-16 border rounded-xl bg-gray-50">
        <p className="text-gray-600 mb-4">{text.empty}</p>
        <Link href="/browse" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
          {text.browse}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
      {items.map((l) => (
        <div key={l.id} className="border rounded-xl overflow-hidden">
          <div className="relative h-32 bg-gray-100 flex items-center justify-center text-5xl">
            <Link href={`/listing/${l.id}`} className="absolute inset-0" aria-label={l.title} />
            <span aria-hidden="true">{l.emoji}</span>
            <FavoriteButton id={l.id} saveLabel={text.save} savedLabel={text.saved} className="absolute top-2 end-2 w-8 h-8" />
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-500">{categories[l.id]}</p>
            <Link href={`/listing/${l.id}`} className="font-semibold hover:text-[#7A1E2B]" dir="ltr">
              {l.title}
            </Link>
            <p className="font-bold mt-1" dir="ltr">{prices[l.id]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
