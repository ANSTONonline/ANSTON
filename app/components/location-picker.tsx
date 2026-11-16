"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clearPlaceFilter, setPlaceFilter } from "../location-actions";

type Text = {
  all: string;
  choose: string;
  country: string;
  region: string;
  allRegions: string;
  city: string;
  anyCity: string;
  apply: string;
  reset: string;
};

type Current = { country: string; region: string; city: string } | null;

const noSubscribe = () => () => {};

function regionNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    return null;
  }
}

// "📍 All locations" button in the header. Opens a small panel to pick a
// country, and optionally a state/region and city. The choice is saved in a
// cookie and filters Featured Listings and Browse.
export default function LocationPicker({
  text,
  locale,
  countryCodes,
  current,
  label,
}: {
  text: Text;
  locale: string;
  countryCodes: string[];
  current: Current;
  label: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(current?.country ?? "");
  const [region, setRegion] = useState(current?.region ?? "");
  const [regions, setRegions] = useState<{ country: string; list: { code: string; name: string }[] } | null>(null);
  const [cities, setCities] = useState<{ key: string; list: string[] }>({ key: "", list: [] });
  const panel = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !country) return;
    let cancelled = false;
    fetch(`/api/places?country=${country}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => !cancelled && setRegions({ country, list }))
      .catch(() => !cancelled && setRegions({ country, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [open, country]);

  const key = `${country}/${region}`;
  useEffect(() => {
    if (!open || !country || !region) return;
    let cancelled = false;
    fetch(`/api/places?country=${country}&region=${encodeURIComponent(region)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => !cancelled && setCities({ key, list }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, country, region, key]);

  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const names = inBrowser ? regionNames(locale) : null;
  const countryName = (code: string) => names?.of(code) ?? code;
  const countries = [...countryCodes].sort((a, b) => countryName(a).localeCompare(countryName(b), locale));
  const regionList = regions?.country === country ? regions.list : null;
  const field = "w-full border rounded-lg px-3 py-2 text-sm bg-white";

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={text.choose}
        className={`flex items-center gap-1 border rounded-full px-3 py-2 text-sm max-w-full md:max-w-[10rem] lg:max-w-[13rem] ${
          label ? "border-[#7A1E2B] text-[#7A1E2B]" : "text-gray-700"
        }`}
      >
        <span aria-hidden>📍</span>
        <span className="truncate">{label ?? text.all}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={text.choose}
          className="absolute z-50 mt-2 start-0 md:start-auto md:end-0 w-72 max-w-[calc(100vw-2rem)] bg-white border rounded-xl shadow-lg p-4"
        >
          <form action={setPlaceFilter} onSubmit={() => setOpen(false)} className="space-y-3">
            <p className="font-semibold text-sm">{text.choose}</p>
            <label className="block text-xs text-gray-600">
              {text.country}
              <select
                name="country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setRegion("");
                }}
                className={`${field} mt-1`}
              >
                <option value="">{text.all}</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{countryName(c)}</option>
                ))}
              </select>
            </label>
            {country && regionList && regionList.length > 0 && (
              <label className="block text-xs text-gray-600">
                {text.region}
                <select name="region" value={region} onChange={(e) => setRegion(e.target.value)} className={`${field} mt-1`}>
                  <option value="">{text.allRegions}</option>
                  {regionList.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </label>
            )}
            {country && region && (
              <label className="block text-xs text-gray-600">
                {text.city}
                <input
                  name="city"
                  defaultValue={current?.region === region ? current.city : ""}
                  placeholder={text.anyCity}
                  maxLength={100}
                  list="location-city-options"
                  autoComplete="off"
                  className={`${field} mt-1`}
                />
                <datalist id="location-city-options">
                  {(cities.key === key ? cities.list : []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            )}
            <button type="submit" className="w-full bg-[#7A1E2B] text-white rounded-lg py-2 text-sm font-medium">
              {text.apply}
            </button>
            {current && (
              <button
                type="submit"
                formAction={clearPlaceFilter}
                onClick={() => {
                  setCountry("");
                  setRegion("");
                }}
                className="w-full border rounded-lg py-2 text-sm"
              >
                {text.reset}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
