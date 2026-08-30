import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "./preferences";

/**
 * Number and currency presentation.
 *
 * Dates live in `@/lib/dates`; this module covers the amounts that module has
 * no concept of. Both read their locale from the same stored preference.
 */

const cached = new Map<string, Intl.NumberFormat>();

function formatter(key: string, locale: string, options: Intl.NumberFormatOptions) {
  const cacheKey = `${key}|${locale}`;
  const existing = cached.get(cacheKey);
  if (existing) return existing;

  let instance: Intl.NumberFormat;
  try {
    instance = new Intl.NumberFormat(locale, options);
  } catch {
    // A stored value this runtime's ICU build rejects must not take down every
    // page that renders an amount.
    instance = new Intl.NumberFormat(DEFAULT_LOCALE, { ...options, currency: DEFAULT_CURRENCY });
  }
  cached.set(cacheKey, instance);
  return instance;
}

/** Whole-unit money in the owner's configured currency, e.g. "$1,250". */
export function formatMoney(value: number, locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY) {
  return formatter(`money:${currency}`, locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** A plain grouped number. Used where a value carries its own free-text unit. */
export function formatDecimal(value: number, locale = DEFAULT_LOCALE, maximumFractionDigits = 2) {
  return formatter(`decimal:${maximumFractionDigits}`, locale, { maximumFractionDigits }).format(value);
}

/** A plain number kept to a few significant digits, for goal pace figures. */
export function formatSignificant(value: number, locale = DEFAULT_LOCALE, maximumSignificantDigits = 3) {
  return formatter(`significant:${maximumSignificantDigits}`, locale, { maximumSignificantDigits }).format(value);
}
