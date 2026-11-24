import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDictionary, getLocale } from "@/i18n/server";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { findSellerListings } from "@/lib/catalog";
import { BUSINESS_COLUMNS, BUSINESS_EMOJI, logoUrl, placeOf, toBusiness } from "@/lib/business";
import ListingCard from "@/app/components/listing-card";
import WeeklyHours from "@/app/components/weekly-hours";

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  if (!supabaseConfigured() || !/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select(`${BUSINESS_COLUMNS}, owner:profiles!businesses_owner_id_fkey ( username, rating_avg, rating_count )`).eq("slug", slug).maybeSingle();
  if (!data) return null;
  type Owner = { username: string | null; rating_avg: number; rating_count: number };
  const raw = (data as unknown as { owner?: Owner | Owner[] | null }).owner;
  const owner = (Array.isArray(raw) ? raw[0] : raw) ?? null;
  return { supabase, business: toBusiness(data as unknown as Record<string, unknown>), owner };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await load((await params).slug);
  return { title: found ? `${found.business.name} | Anston` : "Business | Anston", description: found?.business.about.slice(0, 160) };
}

// A business page. Only verified businesses are public; owners and admins
// can preview theirs before then.
export default async function BusinessPage({ params }: { params: Params }) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { supabase, business: biz, owner } = found;
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const b = t.business;
  const { data: viewer } = await supabase.auth.getUser();
  const isOwner = viewer.user?.id === biz.owner_id;
  const listings = (await findSellerListings(locale, biz.owner_id)).filter((l) => l.status === "active");
  const logo = logoUrl(biz);
  const place = placeOf(biz);
  const mapQuery = [biz.address, place].filter(Boolean).join(", ");

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      {biz.status !== "verified" && (
        <p className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm">
          👁 {b.previewNote} {isOwner && <Link href="/account/business" className="underline">{b.myTitle}</Link>}
        </p>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-8">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="w-28 h-28 rounded-2xl object-cover border shrink-0" />
        ) : (
          <span className="w-28 h-28 rounded-2xl bg-gray-100 flex items-center justify-center text-5xl shrink-0" aria-hidden="true">{BUSINESS_EMOJI[biz.business_type]}</span>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold break-words">{biz.name}</h1>
          {biz.status === "verified" && (
            <p className="inline-flex items-center gap-1 mt-1 bg-green-50 text-green-800 border border-green-200 rounded-full px-3 py-0.5 text-sm font-medium" title={b.verifiedTooltip}>
              ✅ {b.verifiedBusiness}
            </p>
          )}
          <p className="text-gray-600 mt-2">
            {BUSINESS_EMOJI[biz.business_type]} {b.types[biz.business_type]}
            {place && <span> · 📍 {place}</span>}
          </p>
          {owner?.username && (
            <p className="text-sm text-gray-500 mt-1">
              <Link href={`/seller/${owner.username}`} className="hover:underline" dir="ltr">@{owner.username}</Link>
              {owner.rating_count > 0 && <span className="ms-2"><span className="text-amber-500">★</span> {Number(owner.rating_avg).toFixed(1)} ({owner.rating_count})</span>}
            </p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_18rem] gap-8 mb-10">
        <div className="space-y-4">
          {biz.about && <p className="whitespace-pre-line text-gray-800">{biz.about}</p>}
          <p className="text-xs text-gray-500">{b.legalNameShown}: {biz.legal_name}</p>
        </div>
        <aside className="space-y-4">
          <div className="border rounded-xl p-4 space-y-2 text-sm">
            {biz.phone && <a href={`tel:${biz.phone.replace(/[^\d+]/g, "")}`} className="block hover:underline" dir="ltr">📞 {biz.phone}</a>}
            {biz.email && <a href={`mailto:${biz.email}`} className="block hover:underline break-all" dir="ltr">✉️ {biz.email}</a>}
            {biz.website && <a href={biz.website} target="_blank" rel="noopener noreferrer nofollow" className="block hover:underline break-all" dir="ltr">🌐 {biz.website.replace(/^https?:\/\//, "")} ↗</a>}
            {mapQuery && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer" className="block hover:underline">
                📍 {mapQuery} ↗
              </a>
            )}
          </div>
          {biz.hours && <WeeklyHours availability={biz.hours} timeZone={biz.time_zone ?? "UTC"} locale={locale} title={b.hours} zoneNote={t.listing.hoursZone} />}
        </aside>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">{b.listingsTitle} ({listings.length})</h2>
        {listings.length === 0 ? (
          <p className="text-gray-600 border rounded-xl p-6 bg-gray-50">{b.noListings}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {listings.map((l) => <ListingCard key={l.id} listing={l} t={t} />)}
          </div>
        )}
      </section>
    </main>
  );
}
