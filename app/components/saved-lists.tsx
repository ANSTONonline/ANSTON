"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useList } from "./store";
import { FavoriteButton } from "./list-buttons";
import { formatPrice } from "@/lib/listings";

type Card = {
  id: string;
  title: string;
  image: string | null;
  emoji: string;
  category: string;
  price: string;
  priceCents: number;
  currency: string;
  location: string;
  sold: boolean;
};

type CartText = {
  title: string;
  empty: string;
  browse: string;
  remove: string;
  total: string;
  checkout: string;
  checkoutSoon: string;
};

// Fetches card details for the saved ids. Listings that were deleted simply
// don't come back, so they drop out of the list.
function useCards(ids: string[]) {
  const key = ids.join(",");
  const [loaded, setLoaded] = useState<{ key: string; cards: Card[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/listings?ids=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((cards: Card[]) => {
        if (!cancelled) setLoaded({ key, cards });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, cards: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  if (!key) return { cards: [] as Card[], loading: false };
  // Keep showing the previous cards while a changed list reloads.
  const cards = (loaded?.cards ?? []).filter((c) => ids.includes(c.id));
  return { cards, loading: loaded?.key !== key && !loaded };
}

function Thumb({ card, className }: { card: Card; className: string }) {
  return (
    <span className={`bg-gray-100 flex items-center justify-center overflow-hidden ${className}`} aria-hidden="true">
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt="" className="w-full h-full object-cover" />
      ) : (
        card.emoji
      )}
    </span>
  );
}

function Empty({ text }: { text: { empty: string; browse: string } }) {
  return (
    <div className="text-center py-16 border rounded-xl bg-gray-50">
      <p className="text-gray-600 mb-4">{text.empty}</p>
      <Link href="/browse" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
        {text.browse}
      </Link>
    </div>
  );
}

const Loading = () => <div className="h-40 border rounded-xl bg-gray-50 animate-pulse" />;

// The cart page: listings added with "Add to Cart", with a total.
export function CartView({ text }: { text: CartText }) {
  const cart = useList("cart");
  const { cards, loading } = useCards(cart.items);
  if (loading) return <Loading />;
  if (cards.length === 0) return <Empty text={text} />;

  // One total per currency.
  const totals = new Map<string, number>();
  for (const c of cards) if (!c.sold) totals.set(c.currency, (totals.get(c.currency) ?? 0) + c.priceCents);

  return (
    <div className="grid md:grid-cols-3 gap-8">
      <ul className="md:col-span-2 divide-y border rounded-xl">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center gap-4 p-4">
            <Thumb card={c} className="w-16 h-16 rounded-lg text-3xl shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">{c.category}</p>
              <Link href={`/listing/${c.id}`} className="font-semibold hover:text-[#7A1E2B]">
                {c.title}
              </Link>
              <p className="text-sm text-gray-500" dir="ltr">{c.location}</p>
            </div>
            <div className="text-end">
              <p className={`font-bold ${c.sold ? "line-through text-gray-400" : ""}`} dir="ltr">{c.price}</p>
              <button type="button" onClick={() => cart.remove(c.id)} className="text-sm text-[#7A1E2B] hover:underline">
                {text.remove}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="border rounded-xl p-6 h-fit">
        <div className="flex justify-between font-bold text-lg mb-4 gap-4">
          <span>{text.total}</span>
          <span className="text-end" dir="ltr">
            {[...totals].map(([currency, cents]) => (
              <span key={currency} className="block">{formatPrice(cents, currency)}</span>
            ))}
          </span>
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
export function FavoritesView({ text }: { text: { empty: string; browse: string; save: string; saved: string } }) {
  const favorites = useList("favorites");
  const { cards, loading } = useCards(favorites.items);
  if (loading) return <Loading />;
  if (cards.length === 0) return <Empty text={text} />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
      {cards.map((c) => (
        <div key={c.id} className="border rounded-xl overflow-hidden">
          <div className="relative h-32">
            <Thumb card={c} className="absolute inset-0 text-5xl" />
            <Link href={`/listing/${c.id}`} className="absolute inset-0" aria-label={c.title} />
            <FavoriteButton id={c.id} saveLabel={text.save} savedLabel={text.saved} className="absolute top-2 end-2 w-8 h-8" />
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-500">{c.category}</p>
            <Link href={`/listing/${c.id}`} className="font-semibold hover:text-[#7A1E2B]">
              {c.title}
            </Link>
            <p className="font-bold mt-1" dir="ltr">{c.price}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
