import Link from "next/link";
import ListingCard from "./components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { findListings } from "@/lib/catalog";
import { getPlaceFilter, placeLabel } from "@/lib/location-filter";

// Snowflakes for the winter hero: fixed positions so the page renders the same
// on the server and in the browser.
const SNOWFLAKES = Array.from({ length: 48 }, (_, i) => {
  // Simple repeatable "random" number between 0 and 1.
  const r = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    left: Math.round(r(1) * 1000) / 10,
    size: 8 + Math.round(r(2) * 16),
    opacity: 0.35 + Math.round(r(3) * 45) / 100,
    fall: 9 + Math.round(r(4) * 12),
    sway: 3 + Math.round(r(5) * 4),
    delay: Math.round(r(6) * 20),
    glyph: i % 3 === 0 ? "❄" : i % 3 === 1 ? "❅" : "•",
  };
});

export default async function Home() {
  const locale = await getLocale();
  const t = await getDictionary(locale);

  const categories = [
    { slug: "vehicles", name: t.categories.vehicles, emoji: "🚤", color: "bg-blue-500" },
    { slug: "homes", name: t.categories.homes, emoji: "🏠", color: "bg-green-500" },
    { slug: "clothes", name: t.categories.clothes, emoji: "👕", color: "bg-purple-500" },
    { slug: "jewelry", name: t.categories.jewelry, emoji: "💍", color: "bg-pink-500" },
    { slug: "accessories", name: t.categories.accessories, emoji: "🎒", color: "bg-orange-500" },
    { slug: "furniture", name: t.categories.furniture, emoji: "🛋️", color: "bg-amber-500" },
    { slug: "equipment", name: t.categories.equipment, emoji: "🔧", color: "bg-slate-600" },
    { slug: "instruments", name: t.categories.instruments, emoji: "🎸", color: "bg-yellow-600" },
    { slug: "food", name: t.categories.food, emoji: "🍲", color: "bg-red-500" },
    { slug: "services", name: t.categories.services, emoji: "🔔", color: "bg-rose-600" },
    { slug: "other", name: t.categories.other, emoji: "📦", color: "bg-indigo-600" },
    { slug: "", href: "/businesses", name: t.header.businesses, emoji: "🏢", color: "bg-emerald-600" },
  ];

  const tabs = [
    { label: t.featured.all, href: "/browse" },
    { label: t.featured.buy, href: "/browse?mode=buy" },
    { label: t.featured.bid, href: "/browse?mode=bid" },
    { label: t.featured.rent, href: "/browse?mode=rent" },
    { label: t.featured.offer, href: "/browse?mode=offer" },
  ];

  const place = await getPlaceFilter();
  const featured = await findListings(locale, { limit: 8, featured: true, place });

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="winter-hero relative overflow-hidden flex flex-col items-center justify-center text-center pt-24 pb-32 px-4 text-white">
        {/* Falling snow (decorative) */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {SNOWFLAKES.map((f, i) => (
            <span
              key={i}
              className="snowflake"
              style={{
                left: `${f.left}%`,
                fontSize: `${f.size}px`,
                opacity: f.opacity,
                animationDuration: `${f.fall}s, ${f.sway}s`,
                animationDelay: `-${f.delay}s, -${f.delay}s`,
              }}
            >
              {f.glyph}
            </span>
          ))}
        </div>
        <h2 className="winter-text relative text-5xl font-bold mb-4 tracking-wide">Anston</h2>
        <p className="winter-text relative text-xl mb-2">{t.hero.tagline}</p>
        <p className="winter-text relative text-sm mb-8 opacity-90">{t.hero.modes}</p>
        <div className="relative flex gap-4">
          <Link href="/sell" className="bg-white text-[#7A1E2B] px-6 py-3 rounded-lg font-medium">
            {t.hero.startSelling}
          </Link>
          <Link href="/browse" className="border border-white text-white px-6 py-3 rounded-lg font-medium hover:bg-white/10">
            {t.hero.browse}
          </Link>
        </div>
        {/* Snow drifts along the bottom */}
        <svg className="pointer-events-none absolute bottom-0 left-0 w-full h-16 sm:h-20" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,70 C160,30 320,95 520,62 C700,32 860,92 1060,58 C1220,32 1340,72 1440,50 L1440,120 L0,120 Z" fill="#ffffff" fillOpacity="0.55" />
          <path d="M0,92 C200,62 380,112 600,86 C820,60 980,110 1200,84 C1320,70 1390,90 1440,82 L1440,120 L0,120 Z" fill="#ffffff" />
        </svg>
      </section>

      {/* Categories */}
      <section className="px-4 sm:px-8 py-16 bg-gray-50">
        <h3 className="text-3xl font-bold text-center mb-1">{t.categories.title}</h3>
        <p className="text-gray-500 text-center mb-10">{t.categories.subtitle}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={"href" in cat && cat.href ? cat.href : cat.slug ? `/browse?category=${cat.slug}` : "/browse"}
              className="border rounded-xl p-6 text-center bg-white hover:border-[#7A1E2B] hover:shadow-md transition"
            >
              <div
                className={`w-12 h-12 ${cat.color} rounded-full flex items-center justify-center text-2xl mx-auto mb-3`}
              >
                {cat.emoji}
              </div>
              <p className="font-semibold">{cat.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Listings */}
      <section className="px-4 sm:px-8 py-16 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-3xl font-bold">{t.featured.title}</h3>
          <Link href="/browse" className="border rounded-full px-4 py-2 text-sm font-medium hover:border-[#7A1E2B]">
            {t.featured.viewAll}
          </Link>
        </div>
        <p className="text-gray-500 mb-6">
          {t.featured.subtitle}
          {place && <span className="block text-sm text-[#7A1E2B] mt-1">📍 {t.location.showing.replace("{place}", placeLabel(place, locale))}</span>}
        </p>

        <div className="flex flex-wrap gap-3 mb-8">
          {tabs.map((tab, i) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                i === 0 ? "bg-[#7A1E2B] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {featured.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {featured.map((item) => (
              <ListingCard key={item.id} listing={item} t={t} sponsored />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-xl bg-gray-50">
            <p className="text-gray-600 mb-4">{place ? t.location.noneHere : t.featured.empty}</p>
            <Link href="/sell" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
              {t.header.listItem}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
