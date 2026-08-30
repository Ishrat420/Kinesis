import { describe, expect, it } from "vitest";
import {
  formatAgendaDate,
  formatActivityTime,
  formatCalendarDate,
  formatDate,
  formatMonthHeading,
  formatShortMonthYear,
  formatTime,
} from "@/lib/dates";
import { formatDecimal, formatMoney, formatSignificant } from "@/lib/format/numbers";
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  isSupportedCurrency,
  isSupportedLocale,
  resolveFormatPreferences,
} from "@/lib/format/preferences";

// 9 March reads differently depending on whether the day or the month leads.
const SAMPLE = new Date("2026-03-09T00:00:00.000Z");

describe("locale-aware dates", () => {
  it("orders day and month according to the locale", () => {
    const australian = formatDate(SAMPLE, "en-AU");
    const american = formatDate(SAMPLE, "en-US");

    expect(australian.indexOf("9")).toBeLessThan(australian.indexOf("Mar"));
    expect(american.indexOf("Mar")).toBeLessThan(american.indexOf("9"));
  });

  it("keeps en-AU as the default so existing behaviour is unchanged", () => {
    expect(formatDate(SAMPLE)).toBe(formatDate(SAMPLE, "en-AU"));
    expect(formatDate(SAMPLE)).toBe("9 Mar 2026");
  });

  it("applies the locale to every named date variant", () => {
    expect(formatMonthHeading(SAMPLE, "de-DE")).toContain("März");
    expect(formatShortMonthYear(SAMPLE, "de-DE")).toContain("2026");
    expect(formatAgendaDate(SAMPLE, "de-DE")).toContain("März");
    expect(formatCalendarDate(SAMPLE, "de-DE")).toContain("März");
    expect(formatTime("09:05", "en-US")).toMatch(/9[:.]05/);
  });

  it("localizes the absolute date that activity labels fall back to", () => {
    const old = new Date("2026-03-09T00:00:00.000Z");
    const now = new Date("2026-04-30T00:00:00.000Z");
    expect(formatActivityTime(old, now, "en-US")).toBe(formatDate(old, "en-US"));
    expect(formatActivityTime(old, now, "en-AU")).toBe("9 Mar 2026");
  });

  it("renders calendar dates in UTC whatever the host time zone is", () => {
    // Calendar dates are stored at UTC midnight, so honouring a local zone here
    // would move every expiry and due date by a day.
    const midnight = new Date("2026-03-09T00:00:00.000Z");
    expect(formatDate(midnight, "en-AU")).toContain("9");
    expect(formatDate(midnight, "en-GB")).toContain("9");
  });
});

describe("locale-aware amounts", () => {
  it("formats money in the configured currency", () => {
    expect(formatMoney(1250, "en-GB", "GBP")).toContain("£");
    expect(formatMoney(1250, "en-US", "USD")).toContain("$");
    expect(formatMoney(1250, "en-AU", "AUD")).toContain("1,250");
  });

  it("defaults to the previously hardcoded locale and currency", () => {
    expect(formatMoney(1250)).toBe(formatMoney(1250, DEFAULT_LOCALE, DEFAULT_CURRENCY));
  });

  it("groups plain numbers without treating them as money", () => {
    expect(formatDecimal(1234.567, "en-AU", 2)).toBe("1,234.57");
    expect(formatSignificant(0.375, "en-AU", 3)).toBe("0.375");
    expect(formatDecimal(1234.5, "de-DE", 2)).toBe("1.234,5");
  });
});

describe("stored preference resilience", () => {
  it("falls back to the defaults for unsupported stored values", () => {
    expect(resolveFormatPreferences({ locale: "zz-ZZ", currency: "XXX" }))
      .toEqual({ locale: DEFAULT_LOCALE, currency: DEFAULT_CURRENCY });
    expect(resolveFormatPreferences(null))
      .toEqual({ locale: DEFAULT_LOCALE, currency: DEFAULT_CURRENCY });
  });

  it("never throws on a value Intl would reject", () => {
    // A bad stored value must not take down every page that renders a date.
    expect(() => formatDate(SAMPLE, "not a locale")).not.toThrow();
    expect(() => formatMoney(10, "not a locale", "!!")).not.toThrow();
  });

  it("recognises supported values and rejects everything else", () => {
    expect(isSupportedLocale("en-GB")).toBe(true);
    expect(isSupportedLocale("en-ZZ")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedCurrency("EUR")).toBe(true);
    expect(isSupportedCurrency("XXX")).toBe(false);
  });
});
