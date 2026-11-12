import Link from "next/link";
import Form from "next/form";
import ListingCard from "../components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { findListings } from "@/lib/catalog";
import { categorySlugs, isCategory, isMode, type Mode } from "@/lib/listings";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BrowsePage({ searchParams }: { searchParams: SearchParams }) {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const params = await searchParams;
  const modeParam = one(params.mode);
  const categoryParam = one(params.category);
  const q = one(params.q)?.trim() ?? "";
  const mode = isMode(modeParam) ? modeParam : undefined;
  const category = isCategory(categoryParam) ? categoryParam : undefined;

  const results = await findListings(locale, { mode, category, q });

  // Build a link that changes one filter and keeps the others.
  const href = (change: { mode?: string | null; category?: string | null }) => {
    const next = new URLSearchParams();
    const m = change.mode === undefined ? mode : change.mode;
    const c = change.category === undefined ? category : change.category;
    if (m) next.set("mode", m);
    if (c) next.set("category", c);
    if (q) next.set("q", q);
    const s = next.toString();
    return s ? `/browse?${s}` : "/browse";
  };

  const modeTabs: { key: Mode | null; label: string }[] = [
    { key: null, label: t.featured.all },
    { key: "buy", label: t.featured.buy },
    { key: "bid", label: t.featured.bid },
    { key: "rent", label: t.featured.rent },
    { key: "offer", label: t.featured.offer },
    { key: "services", label: t.browse.services },
  ];

  const pill = (active: boolean) =>
    `px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
      active ? "bg-[#7A1E2B] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-1">
        {q ? t.browse.resultsFor.replace("{q}", q) : t.browse.title}
      </h1>
      <p className="text-gray-500 mb-6">{t.browse.count.replace("{n}", String(results.length))}</p>

      {/* Search (works on phones, where the header search is hidden) */}
      <Form action="/browse" className="flex gap-2 mb-6" role="search">
        {mode && <input type="hidden" name="mode" value={mode} />}
        {category && <input type="hidden" name="category" value={category} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.header.search}
          aria-label={t.header.searchButton}
          className="flex-1 border rounded-full px-4 py-2 text-sm bg-gray-50"
        />
        <button type="submit" className="bg-[#7A1E2B] text-white text-sm px-5 py-2 rounded-full">
          {t.header.searchButton}
        </button>
      </Form>

      <div className="flex flex-wrap gap-2 mb-4">
        {modeTabs.map((tab) => (
          <Link key={tab.label} href={href({ mode: tab.key })} className={pill(mode === (tab.key ?? undefined))}>
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <Link href={href({ category: null })} className={pill(!category)}>
          {t.browse.allCategories}
        </Link>
        {categorySlugs.map((c) => (
          <Link key={c} href={href({ category: c })} className={pill(category === c)}>
            {t.categories[c]}
          </Link>
        ))}
      </div>

      {results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {results.map((l) => (
            <ListingCard key={l.id} listing={l} t={t} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border rounded-xl bg-gray-50">
          <p className="text-gray-600 mb-4">{t.browse.none}</p>
          <Link href="/browse" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
            {t.browse.clear}
          </Link>
        </div>
      )}
    </main>
  );
}
