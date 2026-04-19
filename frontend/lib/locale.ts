export const SUPPORTED_LOCALES = ["zh", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function getLanguageTag(locale: Locale) {
  return locale === "zh" ? "zh-CN" : "en-US";
}
