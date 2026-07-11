export const locales = ["en", "vi"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "vi";
export const localeCookieName = "locale";

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}
