import { readAvailability, type Availability } from "@/lib/availability";
import { avatarUrl } from "@/lib/avatar";

// Kinds of business shown in the directory.
export const BUSINESS_TYPES = [
  "food", "retail", "beauty", "health", "home", "auto", "professional",
  "events", "education", "pets", "realestate", "other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const BUSINESS_EMOJI: Record<BusinessType, string> = {
  food: "🍽️", retail: "🛍️", beauty: "💇", health: "💪", home: "🔧", auto: "🚗",
  professional: "💼", events: "🎉", education: "📚", pets: "🐾", realestate: "🏠", other: "🏢",
};

export const DOC_KINDS = ["registration", "ein_letter", "license", "other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_BUCKET = "business-docs";

export type BusinessStatus = "draft" | "pending" | "verified" | "rejected" | "suspended";

export type Business = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  business_type: BusinessType;
  about: string;
  logo_path: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  hours: Availability | null;
  time_zone: string | null;
  legal_name: string;
  registration_region: string | null;
  registration_number: string | null;
  status: BusinessStatus;
  review_note: string | null;
  verified_at: string | null;
};

export const BUSINESS_COLUMNS =
  "id, owner_id, slug, name, business_type, about, logo_path, phone, email, website, address, city, region, country_code, hours, time_zone, legal_name, registration_region, registration_number, status, review_note, verified_at";

export function toBusiness(row: Record<string, unknown>): Business {
  return { ...(row as unknown as Business), hours: readAvailability(row.hours) };
}

export const logoUrl = (b: Pick<Business, "logo_path">) => (b.logo_path ? avatarUrl(b.logo_path) : null);

// "Joe's Pizza & Grill!" → "joes-pizza-grill"
export function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

export const placeOf = (b: Pick<Business, "city" | "region" | "country_code">) =>
  [b.city, b.region, b.country_code].filter(Boolean).join(", ");
