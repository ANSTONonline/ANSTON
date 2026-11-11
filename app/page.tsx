import LanguageSwitcher from "./components/language-switcher";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function Home() {
  const locale = await getLocale();
  const t = await getDictionary(locale);

  const categories = [
    { name: t.categories.vehicles, emoji: "🚗", color: "bg-blue-500" },
    { name: t.categories.homes, emoji: "🏠", color: "bg-green-500" },
    { name: t.categories.boats, emoji: "🚤", color: "bg-cyan-500" },
    { name: t.categories.clothes, emoji: "👕", color: "bg-purple-500" },
    { name: t.categories.jewelry, emoji: "💍", color: "bg-pink-500" },
    { name: t.categories.accessories, emoji: "🎒", color: "bg-orange-500" },
    { name: t.categories.furniture, emoji: "🛋️", color: "bg-amber-500" },
    { name: t.categories.equipment, emoji: "🔧", color: "bg-slate-600" },
    { name: t.categories.services, emoji: "🔔", color: "bg-rose-600" },
    { name: t.categories.more, emoji: "📦", color: "bg-indigo-600" },
  ];

  // Sample listings until real ones come from the database.
  const listings = [
    {
      tag: t.featured.buyNow,
      category: t.categories.vehicles,
      title: "2023 Tesla Model 3 - Low Mileage",
      rating: "4.9",
      reviews: "180",
      location: "Los Angeles, CA",
      price: "$32,000",
    },
    {
      tag: t.featured.buyNow,
      category: t.categories.clothes,
      title: "Designer Leather Jacket - Limited Edition",
      rating: "4.8",
      reviews: "95",
      location: "Chicago, IL",
      price: "$450",
    },
    {
      tag: t.featured.forRent,
      category: t.categories.homes,
      title: "Luxury Penthouse with Ocean View - 3BR/3BA",
      rating: "4.6",
      reviews: "116",
      location: "Miami Beach, FL",
      price: `$8,500${t.featured.perMonth}`,
    },
    {
      tag: t.featured.forRent,
      category: t.categories.homes,
      title: "Modern Downtown Loft - 2BR/2BA",
      rating: "4.9",
      reviews: "62",
      location: "Austin, TX",
      price: `$4,200${t.featured.perMonth}`,
    },
  ];

  const tabs = [
    t.featured.all,
    t.featured.buy,
    t.featured.bid,
    t.featured.rent,
    t.featured.offer,
  ];

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 border-b">
        <h1 className="text-2xl font-bold text-[#7A1E2B]">ANSTON</h1>

        <nav className="hidden md:flex gap-6 text-sm text-gray-700 font-medium">
          <a href="#">{t.header.buy}</a>
          <a href="#">{t.header.bid}</a>
          <a href="#">{t.header.rent}</a>
          <a href="#">{t.header.sell}</a>
          <a href="#">{t.header.services}</a>
        </nav>

        <div className="hidden md:block w-72">
          <input
            type="text"
            placeholder={t.header.search}
            className="w-full border rounded-full px-4 py-2 text-sm bg-gray-50"
          />
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageSwitcher current={locale} label={t.header.language} />
          <button
            className="bg-[#7A1E2B] text-white text-sm px-3 sm:px-4 py-2 rounded-full font-medium whitespace-nowrap"
            aria-label={t.header.listItem}
          >
            <span className="sm:hidden">+</span>
            <span className="hidden sm:inline">{t.header.listItem}</span>
          </button>
          <span className="text-xl cursor-pointer" title={t.header.favorites}>♡</span>
          <span className="text-xl cursor-pointer" title={t.header.cart}>🛒</span>
          <span className="text-xl cursor-pointer" title={t.header.account}>👤</span>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center py-24 px-4 bg-[#7A1E2B] text-white">
        <h2 className="text-5xl font-bold mb-4 tracking-wide">ANSTON</h2>
        <p className="text-xl mb-2">{t.hero.tagline}</p>
        <p className="text-sm mb-8 opacity-90">{t.hero.modes}</p>
        <div className="flex gap-4">
          <button className="bg-white text-[#7A1E2B] px-6 py-3 rounded-lg font-medium">
            {t.hero.startSelling}
          </button>
          <button className="border border-white text-white px-6 py-3 rounded-lg font-medium">
            {t.hero.browse}
          </button>
        </div>
      </section>

      {/* Categories */}
      <section className="px-8 py-16 bg-gray-50">
        <h3 className="text-3xl font-bold text-center mb-1">
          {t.categories.title}
        </h3>
        <p className="text-gray-500 text-center mb-10">
          {t.categories.subtitle}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {categories.map((cat) => (
            <div
              key={cat.name}
              className="border rounded-xl p-6 text-center bg-white hover:border-[#7A1E2B] hover:shadow-md transition cursor-pointer"
            >
              <div
                className={`w-12 h-12 ${cat.color} rounded-full flex items-center justify-center text-2xl mx-auto mb-3`}
              >
                {cat.emoji}
              </div>
              <p className="font-semibold">{cat.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Listings */}
      <section className="px-8 py-16 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-3xl font-bold">{t.featured.title}</h3>
          <button className="border rounded-full px-4 py-2 text-sm font-medium">
            {t.featured.viewAll}
          </button>
        </div>
        <p className="text-gray-500 mb-6">{t.featured.subtitle}</p>

        <div className="flex flex-wrap gap-3 mb-8">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                i === 0
                  ? "bg-[#7A1E2B] text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {listings.map((item) => (
            <div
              key={item.title}
              className="border rounded-xl overflow-hidden hover:shadow-md transition"
            >
              <div className="relative h-40 bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
                <span className="absolute top-2 start-2 bg-[#7A1E2B] text-white text-xs px-2 py-1 rounded">
                  {item.tag}
                </span>
                {t.featured.image}
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-1">{item.category}</p>
                <p className="font-semibold mb-1" dir="ltr">{item.title}</p>
                <p className="text-sm text-gray-600 mb-1">
                  ⭐ {item.rating} ({item.reviews} {t.featured.reviews})
                </p>
                <p className="text-sm text-gray-500 mb-3">📍 {item.location}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold" dir="ltr">{item.price}</span>
                  <button className="bg-[#7A1E2B] text-white text-xs px-3 py-2 rounded-lg">
                    {t.featured.addToCart}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#7A1E2B] text-white px-8 py-12 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
          <div>
            <h4 className="text-xl font-bold mb-2">ANSTON</h4>
            <p className="text-sm opacity-90">{t.footer.about}</p>
          </div>
          <div>
            <h5 className="font-semibold mb-3">{t.footer.quickLinks}</h5>
            <ul className="text-sm space-y-2 opacity-90">
              <li>{t.footer.aboutUs}</li>
              <li>{t.footer.howItWorks}</li>
              <li>{t.footer.pricing}</li>
              <li>{t.footer.faq}</li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold mb-3">{t.footer.categories}</h5>
            <ul className="text-sm space-y-2 opacity-90">
              <li>{t.footer.vehicles}</li>
              <li>{t.footer.realEstate}</li>
              <li>{t.footer.fashion}</li>
              <li>{t.footer.electronics}</li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold mb-3">{t.footer.contact}</h5>
            <p className="text-sm opacity-90">Anston.online@gmail.com</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/20 text-sm opacity-90 flex justify-between flex-wrap gap-2">
          <p>© 2026 ANSTON. {t.footer.rights}</p>
          <div className="flex gap-4">
            <span>{t.footer.privacy}</span>
            <span>{t.footer.terms}</span>
            <span>{t.footer.cookies}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
