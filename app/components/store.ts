"use client";

import { useSyncExternalStore } from "react";

// Cart and saved listings, kept in the visitor's browser until accounts are
// connected. Each list is an array of listing ids.

type ListName = "cart" | "favorites";

const KEY: Record<ListName, string> = {
  cart: "anston-cart",
  favorites: "anston-favorites",
};

const EMPTY: string[] = [];
const listeners = new Set<() => void>();
const cache: Partial<Record<ListName, { raw: string | null; value: string[] }>> = {};

function read(name: ListName): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY[name]);
  } catch {
    raw = null;
  }
  const hit = cache[name];
  if (hit && hit.raw === raw) return hit.value;
  let value: string[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    value = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : EMPTY;
  } catch {
    value = EMPTY;
  }
  cache[name] = { raw, value };
  return value;
}

function write(name: ListName, value: string[]) {
  try {
    window.localStorage.setItem(KEY[name], JSON.stringify(value));
  } catch {
    // Storage blocked (private mode): the change lasts until the page reloads.
    cache[name] = { raw: JSON.stringify(value), value };
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY.cart || e.key === KEY.favorites) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useList(name: ListName) {
  const items = useSyncExternalStore(
    subscribe,
    () => read(name),
    () => EMPTY,
  );
  return {
    items,
    has: (id: string) => items.includes(id),
    add: (id: string) => {
      const current = read(name);
      if (!current.includes(id)) write(name, [...current, id]);
    },
    remove: (id: string) => write(name, read(name).filter((x) => x !== id)),
    toggle: (id: string) => {
      const current = read(name);
      write(name, current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    },
  };
}
