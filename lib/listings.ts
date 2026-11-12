// Sample listings shown until real listings come from the Supabase database.
// When the database is connected, getListings/getListing will query it instead.

export type Mode = "buy" | "bid" | "rent" | "offer" | "services";

export type CategorySlug =
  | "vehicles"
  | "homes"
  | "boats"
  | "clothes"
  | "jewelry"
  | "accessories"
  | "furniture"
  | "equipment"
  | "food"
  | "services";

export const categorySlugs: CategorySlug[] = [
  "vehicles",
  "homes",
  "boats",
  "clothes",
  "jewelry",
  "accessories",
  "furniture",
  "equipment",
  "food",
  "services",
];

export const modes: Mode[] = ["buy", "bid", "rent", "offer", "services"];

export type Listing = {
  id: string;
  title: string;
  description: string;
  category: CategorySlug;
  modes: Mode[];
  priceCents: number;
  priceUnit?: "month" | "day" | "hour" | "session";
  location: string;
  rating: number;
  reviews: number;
  emoji: string;
  featured?: boolean;
};

export const listings: Listing[] = [
  {
    id: "tesla-model-3-2023",
    title: "2023 Tesla Model 3 - Low Mileage",
    description: "Single owner, 12,000 miles, autopilot, clean title. Charger included.",
    category: "vehicles",
    modes: ["buy", "offer"],
    priceCents: 3200000,
    location: "Los Angeles, CA",
    rating: 4.9,
    reviews: 180,
    emoji: "🚗",
    featured: true,
  },
  {
    id: "designer-leather-jacket",
    title: "Designer Leather Jacket - Limited Edition",
    description: "Genuine lambskin, size M, worn twice. Comes with original dust bag.",
    category: "clothes",
    modes: ["buy", "offer"],
    priceCents: 45000,
    location: "Chicago, IL",
    rating: 4.8,
    reviews: 95,
    emoji: "🧥",
    featured: true,
  },
  {
    id: "ocean-view-penthouse",
    title: "Luxury Penthouse with Ocean View - 3BR/3BA",
    description: "Furnished penthouse with a wraparound balcony, pool and 24-hour concierge.",
    category: "homes",
    modes: ["rent"],
    priceCents: 850000,
    priceUnit: "month",
    location: "Miami Beach, FL",
    rating: 4.6,
    reviews: 116,
    emoji: "🏙️",
    featured: true,
  },
  {
    id: "downtown-loft",
    title: "Modern Downtown Loft - 2BR/2BA",
    description: "High ceilings, exposed brick, walking distance to restaurants and transit.",
    category: "homes",
    modes: ["rent"],
    priceCents: 420000,
    priceUnit: "month",
    location: "Austin, TX",
    rating: 4.9,
    reviews: 62,
    emoji: "🏠",
    featured: true,
  },
  {
    id: "toyota-camry-2019",
    title: "2019 Toyota Camry SE",
    description: "64,000 miles, regular maintenance, new tires. Auction ends Friday.",
    category: "vehicles",
    modes: ["bid", "rent"],
    priceCents: 1000000,
    location: "Houston, TX",
    rating: 4.7,
    reviews: 41,
    emoji: "🚙",
  },
  {
    id: "gold-necklace-18k",
    title: "18K Gold Necklace with Pendant",
    description: "Solid 18 karat gold, 12 grams, with certificate of authenticity.",
    category: "jewelry",
    modes: ["bid", "buy"],
    priceCents: 120000,
    location: "New York, NY",
    rating: 4.9,
    reviews: 28,
    emoji: "📿",
  },
  {
    id: "pontoon-boat-weekend",
    title: "Pontoon Boat - 10 Passengers",
    description: "Perfect for lake days. Life jackets and cooler included.",
    category: "boats",
    modes: ["rent"],
    priceCents: 35000,
    priceUnit: "day",
    location: "Lake Conroe, TX",
    rating: 4.8,
    reviews: 73,
    emoji: "🚤",
  },
  {
    id: "sectional-sofa",
    title: "Gray Sectional Sofa - Like New",
    description: "L-shaped, stain-resistant fabric, from a smoke-free home.",
    category: "furniture",
    modes: ["buy", "offer"],
    priceCents: 60000,
    location: "Dallas, TX",
    rating: 4.5,
    reviews: 19,
    emoji: "🛋️",
  },
  {
    id: "power-drill-kit",
    title: "Cordless Power Drill Kit",
    description: "Two batteries, charger and 30-piece bit set.",
    category: "equipment",
    modes: ["rent", "buy"],
    priceCents: 1500,
    priceUnit: "day",
    location: "Houston, TX",
    rating: 4.6,
    reviews: 54,
    emoji: "🔧",
  },
  {
    id: "home-cleaning",
    title: "Professional Home Cleaning - 3 Hours",
    description: "Insured cleaner, supplies included. Deep clean available.",
    category: "services",
    modes: ["services"],
    priceCents: 12000,
    priceUnit: "session",
    location: "Houston, TX",
    rating: 4.9,
    reviews: 210,
    emoji: "🧹",
  },
  {
    id: "guitar-lessons",
    title: "Guitar Lessons for Beginners",
    description: "One-on-one lessons, in person or online. Guitars available to borrow.",
    category: "services",
    modes: ["services"],
    priceCents: 4000,
    priceUnit: "hour",
    location: "Sugar Land, TX",
    rating: 5.0,
    reviews: 37,
    emoji: "🎸",
  },
  {
    id: "homemade-baklava",
    title: "Homemade Pistachio Baklava - 24 Pieces",
    description: "Made fresh to order. Contains nuts and wheat. Made in a home kitchen that is not inspected.",
    category: "food",
    modes: ["buy"],
    priceCents: 3500,
    location: "Houston, TX",
    rating: 4.9,
    reviews: 88,
    emoji: "🍯",
  },
  {
    id: "leather-backpack",
    title: "Handmade Leather Backpack",
    description: "Full-grain leather, laptop sleeve, made to last.",
    category: "accessories",
    modes: ["buy", "offer"],
    priceCents: 18000,
    location: "San Antonio, TX",
    rating: 4.7,
    reviews: 33,
    emoji: "🎒",
  },
];

export function isMode(value: string | undefined): value is Mode {
  return modes.includes(value as Mode);
}

export function isCategory(value: string | undefined): value is CategorySlug {
  return categorySlugs.includes(value as CategorySlug);
}

export function getListings(filters: { mode?: Mode; category?: CategorySlug; q?: string } = {}) {
  const q = filters.q?.trim().toLowerCase();
  return listings.filter(
    (l) =>
      (!filters.mode || l.modes.includes(filters.mode)) &&
      (!filters.category || l.category === filters.category) &&
      (!q ||
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q)),
  );
}

export function getListing(id: string) {
  return listings.find((l) => l.id === id);
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
