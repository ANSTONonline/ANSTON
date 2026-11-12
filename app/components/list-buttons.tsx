"use client";

import Link from "next/link";
import { useList } from "./store";

// "Add to Cart" button. Once added, it turns into a link to the cart.
export function AddToCartButton({
  id,
  label,
  addedLabel,
  className = "",
}: {
  id: string;
  label: string;
  addedLabel: string;
  className?: string;
}) {
  const cart = useList("cart");
  if (cart.has(id)) {
    return (
      <Link
        href="/cart"
        className={`border border-[#7A1E2B] text-[#7A1E2B] rounded-lg text-center ${className}`}
      >
        ✓ {addedLabel}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => cart.add(id)}
      className={`bg-[#7A1E2B] text-white rounded-lg ${className}`}
    >
      {label}
    </button>
  );
}

// Heart button that saves or unsaves a listing.
export function FavoriteButton({
  id,
  saveLabel,
  savedLabel,
  className = "",
}: {
  id: string;
  saveLabel: string;
  savedLabel: string;
  className?: string;
}) {
  const favorites = useList("favorites");
  const saved = favorites.has(id);
  return (
    <button
      type="button"
      onClick={() => favorites.toggle(id)}
      aria-pressed={saved}
      aria-label={saved ? savedLabel : saveLabel}
      title={saved ? savedLabel : saveLabel}
      className={`flex items-center justify-center rounded-full bg-white/90 shadow text-lg ${
        saved ? "text-[#7A1E2B]" : "text-gray-500"
      } ${className}`}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}

// Header icons for saved listings and cart, with a count badge.
export function HeaderCounts({
  favoritesLabel,
  cartLabel,
}: {
  favoritesLabel: string;
  cartLabel: string;
}) {
  const favorites = useList("favorites");
  const cart = useList("cart");
  const badge = (n: number) =>
    n > 0 ? (
      <span className="absolute -top-1 -end-2 min-w-4 h-4 rounded-full bg-[#7A1E2B] px-1 text-[10px] leading-4 text-white text-center">
        {n}
      </span>
    ) : null;
  return (
    <>
      <Link href="/favorites" className="relative text-xl" aria-label={favoritesLabel} title={favoritesLabel}>
        ♡{badge(favorites.items.length)}
      </Link>
      <Link href="/cart" className="relative text-xl" aria-label={cartLabel} title={cartLabel}>
        🛒{badge(cart.items.length)}
      </Link>
    </>
  );
}
