import Avatar from "@/app/components/avatar";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ListingCard from "../../components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { findSellerListings } from "@/lib/catalog";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { LocalTime } from "../../listing/[id]/listing-actions";

type Params = Promise<{ username: string }>;

const USERNAME = /^[a-z0-9_]{3,30}$/;

async function loadProfile(raw: string) {
  const username = decodeURIComponent(raw).toLowerCase();
  if (!supabaseConfigured() || !USERNAME.test(username)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, created_at, rating_avg, rating_count, city, region, country_code, avatar_url")
    .eq("username", username)
    .maybeSingle();
  return data ? { supabase, profile: data } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username).toLowerCase()} | Anston` };
}

// A seller's public page: rating, reviews from buyers, and active listings.
export default async function SellerPage({ params }: { params: Params }) {
  const { username } = await params;
  const found = await loadProfile(username);
  if (!found) notFound();
  const { supabase, profile } = found;
  const { data: viewer } = await supabase.auth.getUser();
  const isMe = viewer.user?.id === profile.id;
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const r = t.reviews;

  const [{ data: reviewRows, error }, listings] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey ( username )")
      .eq("reviewee_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100),
    findSellerListings(locale, profile.id),
  ]);
  if (error) console.error("seller reviews", error.message);
  type Review = { id: string; rating: number; comment: string | null; created_at: string; reviewer: { username: string | null } | null };
  const reviews = (reviewRows ?? []) as unknown as Review[];
  const { data: sellerBusiness } = await supabase
    .from("businesses")
    .select("slug, name")
    .eq("owner_id", profile.id)
    .eq("status", "verified")
    .maybeSingle();
  const active = listings.filter((l) => l.status === "active");
  const sold = listings.filter((l) => l.status === "sold");
  const place = [profile.city, profile.region, profile.country_code].filter(Boolean).join(", ");
  const [sinceBefore, sinceAfter] = t.seller.memberSince.split("{date}");
  const countLabel = profile.rating_count === 1 ? r.one : r.count.replace("{n}", String(profile.rating_count));

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      {isMe && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#7A1E2B]/5 border border-[#7A1E2B]/30 rounded-xl p-4 mb-6 text-sm">
          <p>👁 {t.seller.mineNote}</p>
          <div className="flex gap-2">
            <Link href="/account/selling" className="bg-[#7A1E2B] text-white rounded-lg px-3 py-1.5">{t.seller.manage}</Link>
            <Link href="/account" className="border rounded-lg px-3 py-1.5 bg-white">{t.account.title}</Link>
          </div>
        </div>
      )}
      <div className="flex items-center gap-4 mb-8">
        <Avatar path={profile.avatar_url} username={profile.username} size={80} />
        <div className="min-w-0">
          <h1 className="text-3xl font-bold" dir="ltr">@{profile.username}</h1>
          {sellerBusiness && (
            <Link href={`/business/${sellerBusiness.slug}`} className="inline-flex items-center gap-1 mt-1 bg-green-50 text-green-800 border border-green-200 rounded-full px-3 py-0.5 text-sm font-medium hover:bg-green-100">
              ✅ {t.business.verifiedBusiness}: {sellerBusiness.name}
            </Link>
          )}
          <p className="text-gray-600">
            {profile.rating_count > 0 ? (
              <>
                <span className="text-amber-500">★</span> {Number(profile.rating_avg).toFixed(1)} · {countLabel}
              </>
            ) : (
              r.none
            )}
          </p>
          <p className="text-sm text-gray-500">
            {sinceBefore}<LocalTime iso={profile.created_at} locale={locale} withTime={false} />{sinceAfter}
            {place && <span dir="ltr"> · 📍 {place}</span>}
          </p>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">{t.seller.listings.replace("{username}", profile.username!)}</h2>
        {active.length === 0 ? (
          <p className="text-gray-500">{t.seller.noListings}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {active.map((item) => <ListingCard key={item.id} listing={item} t={t} />)}
          </div>
        )}
      </section>

      {sold.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">{t.seller.sold} <span className="text-gray-500 font-normal text-base">({sold.length})</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 opacity-80">
            {sold.map((item) => <ListingCard key={item.id} listing={item} t={t} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4">{r.title}</h2>
        {reviews.length === 0 ? (
          <p className="text-gray-500">{r.none}</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((rev) => (
              <li key={rev.id} className="border rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-amber-500" aria-label={r.stars.replace("{n}", String(rev.rating))}>
                    {"★".repeat(rev.rating)}<span className="text-gray-300">{"★".repeat(5 - rev.rating)}</span>
                  </span>
                  <span className="text-xs text-gray-500">
                    <span dir="ltr">@{rev.reviewer?.username ?? "—"}</span> · <LocalTime iso={rev.created_at} locale={locale} withTime={false} />
                  </span>
                </div>
                {rev.comment && <p className="text-sm text-gray-700 whitespace-pre-line mt-2 break-words">{rev.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
