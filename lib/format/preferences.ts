/**
 * Regional formatting preferences.
 *
 * This module is deliberately free of server-only imports so that both Server
 * and Client Components can read the supported options and the defaults.
 */

export type FormatPreferences = {
  /** BCP 47 tag driving date order, month names and number grouping. */
  locale: string;
  /** ISO 4217 code used whenever an amount is rendered as money. */
  currency: string;
};

export const DEFAULT_LOCALE = "en-AU";
export const DEFAULT_CURRENCY = "AUD";

export const DEFAULT_FORMAT_PREFERENCES: FormatPreferences = {
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
};

/**
 * Locales are an allow list rather than free text: an unrecognised tag makes
 * every `Intl` constructor throw, which would break every page that renders a
 * date. Validation happens on write, and `createFormatters` falls back on read.
 */
export const SUPPORTED_LOCALES = [
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-NZ", label: "English (New Zealand)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-IE", label: "English (Ireland)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-SG", label: "English (Singapore)" },
  { value: "en-ZA", label: "English (South Africa)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "nl-NL", label: "Dutch (Netherlands)" },
  { value: "sv-SE", label: "Swedish (Sweden)" },
] as const;

export const SUPPORTED_CURRENCIES = [
  { value: "AUD", label: "Australian dollar" },
  { value: "NZD", label: "New Zealand dollar" },
  { value: "USD", label: "US dollar" },
  { value: "GBP", label: "British pound" },
  { value: "EUR", label: "Euro" },
  { value: "CAD", label: "Canadian dollar" },
  { value: "SGD", label: "Singapore dollar" },
  { value: "INR", label: "Indian rupee" },
  { value: "JPY", label: "Japanese yen" },
  { value: "CHF", label: "Swiss franc" },
  { value: "ZAR", label: "South African rand" },
] as const;

export function isSupportedLocale(value: unknown): value is FormatPreferences["locale"] {
  return typeof value === "string" && SUPPORTED_LOCALES.some((locale) => locale.value === value);
}

export function isSupportedCurrency(value: unknown): value is FormatPreferences["currency"] {
  return typeof value === "string" && SUPPORTED_CURRENCIES.some((currency) => currency.value === value);
}

/** Narrows a stored settings row to preferences that `Intl` is known to accept. */
export function resolveFormatPreferences(settings: {
  locale?: string | null;
  currency?: string | null;
} | null | undefined): FormatPreferences {
  return {
    locale: isSupportedLocale(settings?.locale) ? settings.locale : DEFAULT_LOCALE,
    currency: isSupportedCurrency(settings?.currency) ? settings.currency : DEFAULT_CURRENCY,
  };
}
