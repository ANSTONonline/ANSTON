import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "./components/site-header";
import { getPlaceFilter, placeLabel } from "@/lib/location-filter";
import { allCountryCodes } from "@/lib/places";
import SiteFooter from "./components/site-footer";
import { localeDir } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale());
  return {
    title: dict.meta.title,
    description: dict.meta.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const place = await getPlaceFilter();
  const t = await getDictionary(locale);

  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      style={{ colorScheme: "light" }}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-white">
        <SiteHeader
          t={t}
          locale={locale}
          place={{
            current: place ? { country: place.country, region: place.regionCode ?? "", city: place.city ?? "" } : null,
            label: place ? placeLabel(place, locale) : null,
            countryCodes: allCountryCodes(),
          }}
        />
        {children}
        <SiteFooter t={t} />
      </body>
    </html>
  );
}
