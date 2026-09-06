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
  /**
   * IANA zone deciding which day *today* is -- and nothing else.
   *
   * Stored dates stay UTC and render in UTC; this only answers "what day is it
   * where the owner is", which is the question `startOfUtcDay(new Date())` was
   * silently answering with "in UTC". It travels with locale and currency
   * because it has the same problem they do: a Client Component that worked it
   * out from the machine it happens to be running on would disagree with the
   * server and break hydration.
   */
  timeZone: string;
};

export const DEFAULT_LOCALE = "en-AU";
export const DEFAULT_CURRENCY = "AUD";
/** Matched to the locale and currency defaults: this deployment assumes an Australian owner. */
export const DEFAULT_TIME_ZONE = "Australia/Sydney";

export const DEFAULT_FORMAT_PREFERENCES: FormatPreferences = {
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
  timeZone: DEFAULT_TIME_ZONE,
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

/**
 * Every zone this runtime can actually resolve, for the settings picker.
 *
 * Read from `Intl` rather than hand-listed: there are over four hundred, they
 * change, and a stale copy would offer a zone the runtime then throws on.
 */
export function supportedTimeZones(): string[] {
  try {
    return [...Intl.supportedValuesOf("timeZone")];
  } catch {
    return [DEFAULT_TIME_ZONE, "UTC"];
  }
}

/**
 * Asked of `Intl` directly rather than checked against the list above, because
 * the list is what a picker offers while this is what a formatter will accept:
 * aliases and legacy names resolve fine but are not always enumerated.
 */
export function isSupportedTimeZone(value: unknown): value is FormatPreferences["timeZone"] {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

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
  timeZone?: string | null;
} | null | undefined): FormatPreferences {
  return {
    locale: isSupportedLocale(settings?.locale) ? settings.locale : DEFAULT_LOCALE,
    currency: isSupportedCurrency(settings?.currency) ? settings.currency : DEFAULT_CURRENCY,
    timeZone: isSupportedTimeZone(settings?.timeZone) ? settings.timeZone : DEFAULT_TIME_ZONE,
  };
}
