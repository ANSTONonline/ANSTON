import Link from "next/link";
import Form from "next/form";
import ListingCard from "../components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { findListings, getCategories } from "@/lib/catalog";
import { getPlaceFilter, placeLabel } from "@/lib/location-filter";
import { clearPlaceFilter } from "../location-actions";
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
  const deliveryParam = one(params.get);
  const delivery = deliveryParam === "local" || deliveryParam === "ships" ? deliveryParam : undefined;
  // Services: the provider-gender filter, and the service subcategories (Cleaning, Tutoring, ...).
  const servicesView = mode === "services" || category === "services";
  const genderParam = one(params.provider);
  const providerGender = servicesView && (genderParam === "female" || genderParam === "male") ? genderParam : undefined;
  const allCategories = category === "services" ? await getCategories(locale) : [];
  const servicesParent = allCategories.find((c) => c.slug === "services");
  const serviceTypes = servicesParent ? allCategories.filter((c) => c.parentId === servicesParent.id) : [];
  const subParam = one(params.sub);
  const sub = serviceTypes.some((c) => c.slug === subParam) ? subParam : undefined;

  const place = await getPlaceFilter();
  const results = await findListings(locale, { mode, category, q, place, delivery, providerGender, subcategory: sub });

  // Build a link that changes one filter and keeps the others.
  const href = (change: { mode?: string | null; category?: string | null; get?: string | null; provider?: string | null; sub?: string | null }) => {
    const next = new URLSearchParams();
    const m = change.mode === undefined ? mode : change.mode;
    const c = change.category === undefined ? category : change.category;
    const g = change.get === undefined ? delivery : change.get;
    if (m) next.set("mode", m);
    if (c) next.set("category", c);
    if (g) next.set("get", g);
    const sb = change.sub === undefined ? (change.category === undefined ? sub : null) : change.sub;
    if (sb && c === "services") next.set("sub", sb);
    const pg = change.provider === undefined ? providerGender : change.provider;
    if (pg && (m === "services" || c === "services")) next.set("provider", pg);
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
      <p className="text-gray-500 mb-2">{t.browse.count.replace("{n}", String(results.length))}</p>
      {place && (
        <form action={clearPlaceFilter} className="flex flex-wrap items-center gap-2 mb-6 text-sm">
          <span className="bg-[#7A1E2B]/10 text-[#7A1E2B] rounded-full px-3 py-1">
            📍 {t.location.showing.replace("{place}", placeLabel(place, locale))}
          </span>
          <button type="submit" className="underline text-gray-600">{t.location.reset}</button>
        </form>
      )}
      {!place && <div className="mb-4" />}

      {/* Search (works on phones, where the header search is hidden) */}
      <Form action="/browse" className="flex gap-2 mb-6" role="search">
        {mode && <input type="hidden" name="mode" value={mode} />}
        {category && <input type="hidden" name="category" value={category} />}
        {delivery && <input type="hidden" name="get" value={delivery} />}
        {providerGender && <input type="hidden" name="provider" value={providerGender} />}
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

      <div className="md:grid md:grid-cols-[14rem_1fr] md:gap-8">
        {/* Sidebar filters */}
        <aside className="mb-8 md:mb-0 space-y-6" aria-label={t.browse.filters}>
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">{t.browse.getting}</h2>
            <ul className="flex flex-wrap md:flex-col gap-2">
              {([
                [null, t.browse.anyWay],
                ["local", `📍 ${t.browse.localOnly}`],
                ["ships", `🚚 ${t.browse.shipsOnly}`],
              ] as const).map(([key, label]) => (
                <li key={label}>
                  <Link
                    href={href({ get: key })}
                    aria-current={delivery === (key ?? undefined) ? "true" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm border ${
                      delivery === (key ?? undefined) ? "bg-[#7A1E2B] text-white border-[#7A1E2B]" : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            {delivery === "local" && (
              <p className="mt-2 text-xs text-gray-600 bg-gray-50 border rounded-lg p-2">
                {place ? t.browse.localIn.replace("{place}", placeLabel(place, locale)) : t.browse.pickCity}
              </p>
            )}
          </section>

          {servicesView && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-2">{t.browse.provider}</h2>
              <ul className="flex flex-wrap md:flex-col gap-2">
                {([[null, t.browse.anyProvider], ["female", t.profile.female], ["male", t.profile.male]] as const).map(([key, label]) => (
                  <li key={label}>
                    <Link
                      href={href({ provider: key })}
                      aria-current={providerGender === (key ?? undefined) ? "true" : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm border ${
                        providerGender === (key ?? undefined) ? "bg-[#7A1E2B] text-white border-[#7A1E2B]" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">{t.browse.categories}</h2>
            <ul className="flex flex-wrap md:flex-col gap-1">
              <li>
                <Link href={href({ category: null })} className={`block rounded-lg px-3 py-1.5 text-sm ${!category ? "bg-[#7A1E2B]/10 text-[#7A1E2B] font-medium" : "hover:bg-gray-100"}`}>
                  {t.browse.allCategories}
                </Link>
              </li>
              {categorySlugs.map((c) => (
                <li key={c}>
                  <Link href={href({ category: c })} className={`block rounded-lg px-3 py-1.5 text-sm ${category === c && !(c === "services" && sub) ? "bg-[#7A1E2B]/10 text-[#7A1E2B] font-medium" : "hover:bg-gray-100"}`}>
                    {t.categories[c]}
                  </Link>
                  {c === "services" && category === "services" && serviceTypes.length > 0 && (
                    <ul className="mt-1 ms-3 border-s ps-2 flex flex-col gap-1">
                      {serviceTypes.map((st) => (
                        <li key={st.slug}>
                          <Link
                            href={href({ sub: st.slug })}
                            aria-current={sub === st.slug ? "true" : undefined}
                            className={`block rounded-lg px-3 py-1.5 text-sm ${sub === st.slug ? "bg-[#7A1E2B]/10 text-[#7A1E2B] font-medium" : "hover:bg-gray-100"}`}
                          >
                            {st.icon} {st.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div>
          {results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((l) => (
                <ListingCard key={l.id} listing={l} t={t} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border rounded-xl bg-gray-50">
              <p className="text-gray-600 mb-4">{place ? t.location.noneHere : t.browse.none}</p>
              <Link href="/browse" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
                {t.browse.clear}
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
