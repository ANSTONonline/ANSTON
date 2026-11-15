import type { MetadataRoute } from "next";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/server";
import { categorySlugs } from "@/lib/listings";

// The list of public pages Google should know about, served at /sitemap.xml.
// Rebuilt at most once an hour so new listings show up without a redeploy.
export const revalidate = 3600;

const SITE = "https://www.myanston.com";

// Pages anyone can open without signing in.
const PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/browse", priority: 0.9, changeFrequency: "daily" },
  { path: "/browse?mode=buy", priority: 0.8, changeFrequency: "daily" },
  { path: "/browse?mode=bid", priority: 0.8, changeFrequency: "daily" },
  { path: "/browse?mode=rent", priority: 0.8, changeFrequency: "daily" },
  { path: "/browse?mode=services", priority: 0.8, changeFrequency: "daily" },
  { path: "/how-it-works", priority: 0.6, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
];

// Active listings, newest first. Google allows 50,000 links per sitemap.
async function activeListings(): Promise<MetadataRoute.Sitemap> {
  if (!supabaseConfigured()) return [];
  // No cookies here: the sitemap only shows what a signed-out visitor can see.
  const supabase = createPlainClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("listings")
    .select("id, updated_at")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(45000);
  if (error) {
    console.error("sitemap listings", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    url: `${SITE}/listing/${row.id}`,
    lastModified: row.updated_at ? new Date(row.updated_at) : undefined,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = PAGES.map((p) => ({
    url: `${SITE}${p.path === "/" ? "" : p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  const categories = categorySlugs.map((slug) => ({
    url: `${SITE}/browse?category=${slug}`,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));
  return [...pages, ...categories, ...(await activeListings())];
}
