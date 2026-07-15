export default function Home() {
  const categories = [
    { name: "Cars", emoji: "🚗", color: "bg-blue-500" },
    { name: "Homes", emoji: "🏠", color: "bg-green-500" },
    { name: "Boats", emoji: "🚤", color: "bg-cyan-500" },
    { name: "Clothes", emoji: "👕", color: "bg-purple-500" },
    { name: "Jewelry", emoji: "💍", color: "bg-pink-500" },
    { name: "Accessories", emoji: "🎒", color: "bg-orange-500" },
    { name: "Furniture", emoji: "🛋️", color: "bg-amber-500" },
    { name: "Equipment", emoji: "🔧", color: "bg-slate-600" },
    { name: "Services", emoji: "🔔", color: "bg-rose-600" },
    { name: "More", emoji: "📦", color: "bg-indigo-600" },
  ];

  const listings = [
    {
      tag: "Buy Now",
      category: "Cars",
      title: "2023 Tesla Model 3 - Low Mileage",
      rating: "4.9",
      reviews: "180",
      location: "Los Angeles, CA",
      price: "$32,000",
    },
    {
      tag: "Buy Now",
      category: "Clothes",
      title: "Designer Leather Jacket - Limited Edition",
      rating: "4.8",
      reviews: "95",
      location: "Chicago, IL",
      price: "$450",
    },
    {
      tag: "For Rent",
      category: "Homes",
      title: "Luxury Penthouse with Ocean View - 3BR/3BA",
      rating: "4.6",
      reviews: "116",
      location: "Miami Beach, FL",
      price: "$8,500/mo",
    },
    {
      tag: "For Rent",
      category: "Homes",
      title: "Modern Downtown Loft - 2BR/2BA",
      rating: "4.9",
      reviews: "62",
      location: "Austin, TX",
      price: "$4,200/mo",
    },
  ];

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b">
        <h1 className="text-2xl font-bold text-[#7A1E2B]">ANSTON</h1>

        <nav className="hidden md:flex gap-6 text-sm text-gray-700 font-medium">
          <a href="#">Buy</a>
          <a href="#">Bid</a>
          <a href="#">Rent</a>
          <a href="#">Sell</a>
          <a href="#">Services</a>
        </nav>

        <div className="hidden md:block w-72">
          <input
            type="text"
            placeholder="Search for anything..."
            className="w-full border rounded-full px-4 py-2 text-sm bg-gray-50"
          />
        </div>

        <div className="flex items-center gap-4">
          <button className="bg-[#7A1E2B] text-white text-sm px-4 py-2 rounded-full font-medium">
            + List Item
          </button>
          <span className="text-xl cursor-pointer">♡</span>
          <span className="text-xl cursor-pointer">🛒</span>
          <span className="text-xl cursor-pointer">👤</span>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center py-24 px-4 bg-[#7A1E2B] text-white">
        <h2 className="text-5xl font-bold mb-4 tracking-wide">ANSTON</h2>
        <p className="text-xl mb-2">Your All in One Marketplace</p>
        <p className="text-sm mb-8 opacity-90">
          Buy • Bid • Rent • Offer • Sell
        </p>
        <div className="flex gap-4">
          <button className="bg-white text-[#7A1E2B] px-6 py-3 rounded-lg font-medium">
            Start Selling
          </button>
          <button className="border border-white text-white px-6 py-3 rounded-lg font-medium">
            Browse Listings
          </button>
        </div>
      </section>

      {/* Categories */}
      <section className="px-8 py-16 bg-gray-50">
        <h3 className="text-3xl font-bold text-center mb-1">
          Browse by Category
        </h3>
        <p className="text-gray-500 text-center mb-10">
          Find exactly what you&apos;re looking for
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
          <h3 className="text-3xl font-bold">Featured Listings</h3>
          <button className="border rounded-full px-4 py-2 text-sm font-medium">
            View All
          </button>
        </div>
        <p className="text-gray-500 mb-6">
          Discover the best deals and opportunities
        </p>

        <div className="flex gap-3 mb-8">
          {["All", "Buy", "Bid", "Rent", "Offer"].map((tab, i) => (
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
                <span className="absolute top-2 left-2 bg-[#7A1E2B] text-white text-xs px-2 py-1 rounded">
                  {item.tag}
                </span>
                Image
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-1">{item.category}</p>
                <p className="font-semibold mb-1">{item.title}</p>
                <p className="text-sm text-gray-600 mb-1">
                  ⭐ {item.rating} ({item.reviews} reviews)
                </p>
                <p className="text-sm text-gray-500 mb-3">📍 {item.location}</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold">{item.price}</span>
                  <button className="bg-[#7A1E2B] text-white text-xs px-3 py-2 rounded-lg">
                    Add to Cart
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
            <p className="text-sm opacity-90">
              Your all-in-one marketplace for buying, bidding, renting, and
              selling. Everything you need in one place.
            </p>
          </div>
          <div>
            <h5 className="font-semibold mb-3">Quick Links</h5>
            <ul className="text-sm space-y-2 opacity-90">
              <li>About Us</li>
              <li>How It Works</li>
              <li>Pricing</li>
              <li>FAQ</li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold mb-3">Categories</h5>
            <ul className="text-sm space-y-2 opacity-90">
              <li>Cars & Vehicles</li>
              <li>Real Estate</li>
              <li>Fashion & Accessories</li>
              <li>Electronics</li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold mb-3">Contact Us</h5>
            <p className="text-sm opacity-90">Anston.online@gmail.com</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/20 text-sm opacity-90 flex justify-between flex-wrap gap-2">
          <p>© 2026 ANSTON. All rights reserved.</p>
          <div className="flex gap-4">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Cookie Policy</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
