// The "browse by location" choice from the header. It lives in a cookie so it
// follows the visitor around the site. No cookie means all locations.

import { cookies } from "next/headers";
import { citiesOf, isCountry, regionsOf } from "@/lib/places";

export const LOCATION_COOKIE = "anston_location";

export type PlaceFilter = {
  country: string; // ISO code, e.g. "US"
  regionCode: string | null; // e.g. "TX"
  regionName: string | null; // e.g. "Texas" (what listings store)
  city: string | null;
};

// Checks and cleans a choice, so a hand-edited cookie can't put junk in queries.
export function cleanPlace(country: string, regionCode: string, city: string): PlaceFilter | null {
  const c = country.trim().toUpperCase();
  if (!isCountry(c)) return null;
  const region = regionCode ? regionsOf(c).find((r) => r.code === regionCode) ?? null : null;
  const typed = region ? city.trim().replace(/\s+/g, " ").slice(0, 100) : "";
  // Use the city's proper spelling when it's in the list ("houston" -> "Houston").
  const known = typed ? citiesOf(c, region!.code).find((n) => n.toLowerCase() === typed.toLowerCase()) : undefined;
  const cityName = known ?? typed;
  return { country: c, regionCode: region?.code ?? null, regionName: region?.name ?? null, city: cityName || null };
}

export async function getPlaceFilter(): Promise<PlaceFilter | null> {
  const raw = (await cookies()).get(LOCATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { country?: string; region?: string; city?: string };
    return cleanPlace(v.country ?? "", v.region ?? "", v.city ?? "");
  } catch {
    return null;
  }
}

// "Houston, Texas, United States" in the visitor's language.
export function placeLabel(place: PlaceFilter, locale: string) {
  let country = place.country;
  try {
    country = new Intl.DisplayNames([locale], { type: "region" }).of(place.country) ?? place.country;
  } catch {}
  return [place.city, place.regionName, country].filter(Boolean).join(", ");
}
