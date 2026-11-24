import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { getDictionary, getLocale } from "@/i18n/server";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { getPlaceFilter, placeLabel } from "@/lib/location-filter";
import { BUSINESS_EMOJI, BUSINESS_TYPES, logoUrl, placeOf, type BusinessType } from "@/lib/business";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const metadata: Metadata = { title: "Businesses | Anston" };

// The Businesses directory: verified business pages only.
export default async function BusinessesPage({ searchParams }: { searchParams: SearchParams }) {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const b = t.business;
  const params = await searchParams;
  const q = (one(params.q) ?? "").trim().slice(0, 80);
  const typeParam = one(params.type);
  const type = (BUSINESS_TYPES as readonly string[]).includes(typeParam ?? "") ? (typeParam as BusinessType) : undefined;
  const place = await getPlaceFilter();

  type Row = { slug: string; name: string; business_type: BusinessType; logo_path: string | null; city: string | null; region: string | null; country_code: string | null; about: string };
  let rows: Row[] = [];
  if (supabaseConfigured()) {
    const supabase = await createClient();
    let query = supabase
      .from("businesses")
      .select("slug, name, business_type, logo_path, city, region, country_code, about")
      .eq("status", "verified");
    if (type) query = query.eq("business_type", type);
    const clean = q.replace(/[%_*,()"'\\:.]/g, " ").replace(/\s+/g, " ").trim();
    if (clean) query = query.or(`name.ilike.%${clean}%,about.ilike.%${clean}%`);
    if (place) {
      query = query.eq("country_code", place.country);
      if (place.regionName) query = query.eq("region", place.regionName);
      if (place.city) query = query.ilike("city", place.city.replace(/[\\%_]/g, (ch) => `\\${ch}`));
    }
    const { data, error } = await query.order("verified_at", { ascending: false }).limit(120);
    if (error) console.error("businesses", error.message);
    rows = (data ?? []) as Row[];
  }

  const href = (nextType: string | null) => {
    const p = new URLSearchParams();
    if (nextType) p.set("type", nextType);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/businesses?${s}` : "/businesses";
  };

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold">🏢 {b.directoryTitle}</h1>
          <p className="text-gray-600">{b.directoryIntro}</p>
        </div>
        <Link href="/account/business" className="bg-[#7A1E2B] text-white px-4 py-2 rounded-full text-sm whitespace-nowrap">{b.listYours}</Link>
      </div>
      {place && <p className="text-sm text-[#7A1E2B] mb-2">📍 {t.location.showing.replace("{place}", placeLabel(place, locale))}</p>}

      <Form action="/businesses" className="flex gap-2 my-6" role="search">
        {type && <input type="hidden" name="type" value={type} />}
        <input type="search" name="q" defaultValue={q} placeholder={b.searchPlaceholder} aria-label={t.header.searchButton} className="flex-1 border rounded-full px-4 py-2 text-sm bg-gray-50" />
        <button type="submit" className="bg-[#7A1E2B] text-white text-sm px-5 py-2 rounded-full">{t.header.searchButton}</button>
      </Form>

      <div className="md:grid md:grid-cols-[14rem_1fr] md:gap-8">
        <aside className="mb-8 md:mb-0" aria-label={t.browse.filters}>
          <h2 className="text-sm font-semibold mb-2">{b.type}</h2>
          <ul className="flex flex-wrap md:flex-col gap-1">
            <li><Link href={href(null)} className={`block rounded-lg px-3 py-1.5 text-sm ${!type ? "bg-[#7A1E2B]/10 text-[#7A1E2B] font-medium" : "hover:bg-gray-100"}`}>{b.allTypes}</Link></li>
            {BUSINESS_TYPES.map((k) => (
              <li key={k}>
                <Link href={href(k)} className={`block rounded-lg px-3 py-1.5 text-sm ${type === k ? "bg-[#7A1E2B]/10 text-[#7A1E2B] font-medium" : "hover:bg-gray-100"}`}>
                  {BUSINESS_EMOJI[k]} {b.types[k]}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <div>
          {rows.length === 0 ? (
            <div className="text-center py-16 border rounded-xl bg-gray-50">
              <p className="text-gray-600 mb-4">{b.none}</p>
              <Link href="/account/business" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">{b.listYours}</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {rows.map((r) => {
                const logo = logoUrl(r);
                return (
                  <Link key={r.slug} href={`/business/${r.slug}`} className="border rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="w-14 h-14 rounded-xl object-cover border shrink-0" />
                      ) : (
                        <span className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0" aria-hidden="true">{BUSINESS_EMOJI[r.business_type]}</span>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{r.name}</p>
                        <p className="text-xs text-green-700 font-medium">✅ {b.verified}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">{BUSINESS_EMOJI[r.business_type]} {b.types[r.business_type]}{placeOf(r) ? ` · 📍 ${placeOf(r)}` : ""}</p>
                    {r.about && <p className="text-sm text-gray-700 line-clamp-2">{r.about}</p>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
