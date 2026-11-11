// Languages the Anston website can be shown in.
// `dir` is the text direction: Arabic and Urdu are written right to left.
export const locales = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "zh", name: "中文", dir: "ltr" },
  { code: "fr", name: "Français", dir: "ltr" },
  { code: "ur", name: "اردو", dir: "rtl" },
] as const;

export type Locale = (typeof locales)[number]["code"];

export const defaultLocale: Locale = "en";

// Cookie that remembers the visitor's chosen language.
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.some((l) => l.code === value);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return locales.find((l) => l.code === locale)?.dir ?? "ltr";
}
