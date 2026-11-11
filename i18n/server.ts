import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import en from "./dictionaries/en.json";

export type Dictionary = typeof en;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  ar: () => import("./dictionaries/ar.json").then((m) => m.default),
  es: () => import("./dictionaries/es.json").then((m) => m.default),
  zh: () => import("./dictionaries/zh.json").then((m) => m.default),
  fr: () => import("./dictionaries/fr.json").then((m) => m.default),
  ur: () => import("./dictionaries/ur.json").then((m) => m.default),
};

// The visitor's language: the one they picked (saved in a cookie), otherwise
// the first supported language their browser asks for, otherwise English.
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  for (const part of acceptLanguage.split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return defaultLocale;
}

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
