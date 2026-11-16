import Link from "next/link";
import Form from "next/form";
import LanguageSwitcher from "./language-switcher";
import LocationPicker from "./location-picker";
import { HeaderCounts } from "./list-buttons";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/server";

type HeaderPlace = {
  current: { country: string; region: string; city: string } | null;
  label: string | null;
  countryCodes: string[];
};

export default function SiteHeader({ t, locale, place }: { t: Dictionary; locale: Locale; place: HeaderPlace }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 sm:px-8 py-4 border-b">
      <Link href="/" className="text-2xl font-bold text-[#7A1E2B]">
        ANSTON
      </Link>

      <nav className="hidden lg:flex gap-4 xl:gap-6 text-sm text-gray-700 font-medium">
        <Link href="/browse?mode=buy" className="hover:text-[#7A1E2B]">{t.header.buy}</Link>
        <Link href="/browse?mode=bid" className="hover:text-[#7A1E2B]">{t.header.bid}</Link>
        <Link href="/browse?mode=rent" className="hover:text-[#7A1E2B]">{t.header.rent}</Link>
        <Link href="/sell" className="hover:text-[#7A1E2B]">{t.header.sell}</Link>
        <Link href="/browse?mode=services" className="hover:text-[#7A1E2B]">{t.header.services}</Link>
      </nav>

      <Form action="/browse" className="hidden xl:block w-56 2xl:w-72" role="search">
        <input
          type="search"
          name="q"
          placeholder={t.header.search}
          aria-label={t.header.searchButton}
          className="w-full border rounded-full px-4 py-2 text-sm bg-gray-50"
        />
      </Form>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden md:block">
          <LocationPicker
          text={t.location}
          locale={locale}
          countryCodes={place.countryCodes}
          current={place.current}
          label={place.label}
        />
        </div>
        <LanguageSwitcher current={locale} label={t.header.language} />
        <Link
          href="/sell"
          className="bg-[#7A1E2B] text-white text-sm px-3 sm:px-4 py-2 rounded-full font-medium whitespace-nowrap"
          aria-label={t.header.listItem}
        >
          <span className="sm:hidden">+</span>
          <span className="hidden sm:inline">{t.header.list}</span>
        </Link>
        <HeaderCounts favoritesLabel={t.header.favorites} cartLabel={t.header.cart} />
        <Link href="/messages" className="text-xl" aria-label={t.header.messages} title={t.header.messages}>
          💬
        </Link>
        <Link href="/account" className="text-xl" aria-label={t.header.account} title={t.header.account}>
          👤
        </Link>
      </div>

      {/* On phones the location picker gets its own row. */}
      <div className="w-full md:hidden">
        <LocationPicker
          text={t.location}
          locale={locale}
          countryCodes={place.countryCodes}
          current={place.current}
          label={place.label}
        />
      </div>
    </header>
  );
}
