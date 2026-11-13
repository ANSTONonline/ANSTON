// Languages the Anston website can be shown in.
// `dir` is the text direction: Arabic, Urdu, Persian and Hebrew are written
// right to left.
export const locales = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "zh", name: "中文", dir: "ltr" },
  { code: "fr", name: "Français", dir: "ltr" },
  { code: "ur", name: "اردو", dir: "rtl" },
  { code: "hi", name: "हिन्दी", dir: "ltr" },
  { code: "bn", name: "বাংলা", dir: "ltr" },
  { code: "id", name: "Bahasa Indonesia", dir: "ltr" },
  { code: "pt", name: "Português", dir: "ltr" },
  { code: "ru", name: "Русский", dir: "ltr" },
  { code: "de", name: "Deutsch", dir: "ltr" },
  { code: "it", name: "Italiano", dir: "ltr" },
  { code: "tr", name: "Türkçe", dir: "ltr" },
  { code: "ja", name: "日本語", dir: "ltr" },
  { code: "ko", name: "한국어", dir: "ltr" },
  { code: "vi", name: "Tiếng Việt", dir: "ltr" },
  { code: "fil", name: "Filipino", dir: "ltr" },
  { code: "fa", name: "فارسی", dir: "rtl" },
  { code: "sw", name: "Kiswahili", dir: "ltr" },
  { code: "he", name: "עברית", dir: "rtl" },
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
