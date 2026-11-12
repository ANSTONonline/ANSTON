import Link from "next/link";
import ListingCard from "./components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { findListings } from "@/lib/catalog";

export default async function Home() {
  const locale = await getLocale();
  const t = await getDictionary(locale);

  const categories = [
    { slug: "vehicles", name: t.categories.vehicles, emoji: "🚗", color: "bg-blue-500" },
    { slug: "homes", name: t.categories.homes, emoji: "🏠", color: "bg-green-500" },
    { slug: "boats", name: t.categories.boats, emoji: "🚤", color: "bg-cyan-500" },
    { slug: "clothes", name: t.categories.clothes, emoji: "👕", color: "bg-purple-500" },
    { slug: "jewelry", name: t.categories.jewelry, emoji: "💍", color: "bg-pink-500" },
    { slug: "accessories", name: t.categories.accessories, emoji: "🎒", color: "bg-orange-500" },
    { slug: "furniture", name: t.categories.furniture, emoji: "🛋️", color: "bg-amber-500" },
    { slug: "equipment", name: t.categories.equipment, emoji: "🔧", color: "bg-slate-600" },
    { slug: "services", name: t.categories.services, emoji: "🔔", color: "bg-rose-600" },
    { slug: "", name: t.categories.more, emoji: "📦", color: "bg-indigo-600" },
  ];

  const tabs = [
    { label: t.featured.all, href: "/browse" },
    { label: t.featured.buy, href: "/browse?mode=buy" },
    { label: t.featured.bid, href: "/browse?mode=bid" },
    { label: t.featured.rent, href: "/browse?mode=rent" },
    { label: t.featured.offer, href: "/browse?mode=offer" },
  ];

  const featured = await findListings(locale, { limit: 8 });

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center py-24 px-4 bg-[#7A1E2B] text-white">
        <h2 className="text-5xl font-bold mb-4 tracking-wide">ANSTON</h2>
        <p className="text-xl mb-2">{t.hero.tagline}</p>
        <p className="text-sm mb-8 opacity-90">{t.hero.modes}</p>
        <div className="flex gap-4">
          <Link href="/sell" className="bg-white text-[#7A1E2B] px-6 py-3 rounded-lg font-medium">
            {t.hero.startSelling}
          </Link>
          <Link href="/browse" className="border border-white text-white px-6 py-3 rounded-lg font-medium">
            {t.hero.browse}
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="px-4 sm:px-8 py-16 bg-gray-50">
        <h3 className="text-3xl font-bold text-center mb-1">{t.categories.title}</h3>
        <p className="text-gray-500 text-center mb-10">{t.categories.subtitle}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={cat.slug ? `/browse?category=${cat.slug}` : "/browse"}
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
        <p className="text-gray-500 mb-6">{t.featured.subtitle}</p>

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
              <ListingCard key={item.id} listing={item} t={t} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-xl bg-gray-50">
            <p className="text-gray-600 mb-4">{t.featured.empty}</p>
            <Link href="/sell" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
              {t.header.listItem}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
