export const locales = ["az", "ru", "en", "ka"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "az";
export const LOCALE_COOKIE = "railops_locale";

export const localeNames: Record<Locale, string> = {
  az: "Azərbaycan",
  ru: "Русский",
  en: "English",
  ka: "ქართული",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
