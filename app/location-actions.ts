"use server";

import { cookies } from "next/headers";
import { LOCATION_COOKIE, cleanPlace } from "@/lib/location-filter";

const YEAR = 60 * 60 * 24 * 365;

// Save the header's location choice. An empty country means all locations.
export async function setPlaceFilter(fd: FormData) {
  const store = await cookies();
  const place = cleanPlace(String(fd.get("country") ?? ""), String(fd.get("region") ?? ""), String(fd.get("city") ?? ""));
  if (!place) {
    store.delete(LOCATION_COOKIE);
    return;
  }
  store.set(
    LOCATION_COOKIE,
    JSON.stringify({ country: place.country, region: place.regionCode ?? "", city: place.city ?? "" }),
    { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" },
  );
}

export async function clearPlaceFilter() {
  (await cookies()).delete(LOCATION_COOKIE);
}
