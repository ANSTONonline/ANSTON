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
  hi: () => import("./dictionaries/hi.json").then((m) => m.default),
  bn: () => import("./dictionaries/bn.json").then((m) => m.default),
  id: () => import("./dictionaries/id.json").then((m) => m.default),
  pt: () => import("./dictionaries/pt.json").then((m) => m.default),
  ru: () => import("./dictionaries/ru.json").then((m) => m.default),
  de: () => import("./dictionaries/de.json").then((m) => m.default),
  it: () => import("./dictionaries/it.json").then((m) => m.default),
  tr: () => import("./dictionaries/tr.json").then((m) => m.default),
  ja: () => import("./dictionaries/ja.json").then((m) => m.default),
  ko: () => import("./dictionaries/ko.json").then((m) => m.default),
  vi: () => import("./dictionaries/vi.json").then((m) => m.default),
  fil: () => import("./dictionaries/fil.json").then((m) => m.default),
  fa: () => import("./dictionaries/fa.json").then((m) => m.default),
  sw: () => import("./dictionaries/sw.json").then((m) => m.default),
  he: () => import("./dictionaries/he.json").then((m) => m.default),
};

// Older or alternative codes some browsers send.
const ALIASES: Record<string, Locale> = { tl: "fil", iw: "he", in: "id", pes: "fa", prs: "fa" };

// The visitor's language: the one they picked (saved in a cookie), otherwise
// the first supported language their browser asks for, otherwise English.
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  for (const part of acceptLanguage.split(",")) {
    const code = part.split(";")[0].trim().split("-")[0].toLowerCase();
    const match = isLocale(code) ? code : ALIASES[code];
    if (match) return match;
  }
  return defaultLocale;
}

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
