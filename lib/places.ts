// Countries, states/regions and cities, used to check that a listing's
// location makes sense (no "Houston, Texas" in the United Kingdom).
// The data comes from the country-state-city package and is only loaded on
// the server.

import { City, Country, State } from "country-state-city";

export type Region = { code: string; name: string };

export function allCountryCodes(): string[] {
  return Country.getAllCountries().map((c) => c.isoCode);
}

export function isCountry(code: string) {
  return Boolean(Country.getCountryByCode(code));
}

export function regionsOf(country: string): Region[] {
  return State.getStatesOfCountry(country)
    .map((s) => ({ code: s.isoCode, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function citiesOf(country: string, region: string): string[] {
  return [...new Set(City.getCitiesOfState(country, region).map((c) => c.name))].sort((a, b) => a.localeCompare(b));
}

// City name (lowercase, without accents) -> where cities with that name are.
let cityIndex: Map<string, { country: string; region: string; name: string }[]> | null = null;
const simplify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function index() {
  if (!cityIndex) {
    cityIndex = new Map();
    for (const c of City.getAllCities()) {
      const key = simplify(c.name);
      const list = cityIndex.get(key) ?? [];
      list.push({ country: c.countryCode, region: c.stateCode, name: c.name });
      cityIndex.set(key, list);
    }
  }
  return cityIndex;
}

export type LocationCheck =
  | { ok: true; regionName: string | null; city: string | null }
  | { ok: false; error: "location" | "region" | "cityMismatch" };

// Checks a country, region code and city typed by a seller. Cities that
// aren't in the list at all (small towns) are accepted as typed; a city that
// only exists somewhere else (another state or country) is refused.
export function checkLocation(country: string, regionCode: string, city: string): LocationCheck {
  if (!isCountry(country)) return { ok: false, error: "location" };
  const regions = regionsOf(country);
  let regionName: string | null = null;
  if (regions.length > 0) {
    const region = regions.find((r) => r.code === regionCode);
    if (!region) return { ok: false, error: "region" };
    regionName = region.name;
  }
  const typed = city.trim().slice(0, 100);
  if (!typed) return { ok: true, regionName, city: null };

  const matches = index().get(simplify(typed)) ?? [];
  const here = matches.find((m) => m.country === country && (regions.length === 0 || m.region === regionCode));
  if (here) return { ok: true, regionName, city: here.name };
  if (matches.length > 0) return { ok: false, error: "cityMismatch" };
  return { ok: true, regionName, city: typed };
}

// For editing: the region code of a stored region name.
export function regionCodeFor(country: string, regionName: string | null) {
  if (!regionName) return "";
  return regionsOf(country).find((r) => r.name === regionName || r.code === regionName)?.code ?? "";
}
