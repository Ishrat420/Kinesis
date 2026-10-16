/**
 * Dates as printed on documents, read into the `YYYY-MM-DD` the date inputs
 * take (KD-016, ADR-017).
 *
 * Pure and deterministic: no OCR here, only text. Anything that isn't a real
 * calendar date is dropped rather than coerced -- a blank expiry costs the
 * user a few seconds, a wrong one costs them a missed renewal.
 */

/** Which way round an all-numeric date like 03/04/2027 is read. */
export type DateOrder = "DMY" | "MDY" | "YMD";

/** The owner's locale settles 03/04/2027; nothing else does. */
export function dateOrderFor(locale: string): DateOrder {
  try {
    const order = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" })
      .formatToParts(new Date(Date.UTC(2000, 10, 22)))
      .filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
      .map((part) => part.type[0])
      .join("");
    if (order.startsWith("y")) return "YMD";
    if (order.startsWith("m")) return "MDY";
  } catch {
    // An unrecognised locale falls through to the most common order.
  }
  return "DMY";
}

/**
 * The order the document itself uses, when it gives itself away: any numeric
 * date with a part over 12 (23/04/2027, 04/23/2027) can only be read one way,
 * and a document doesn't mix orders. Without such a date, or with dates
 * pointing both ways, the owner's locale decides.
 */
export function documentDateOrder(text: string, fallback: DateOrder): DateOrder {
  let dayFirst = false;
  let monthFirst = false;
  for (const match of text.matchAll(/\b(\d{1,2})([-/.])(\d{1,2})\2(?:\d{4}|\d{2})\b/g)) {
    const first = Number(match[1]);
    const second = Number(match[3]);
    if (first > 12 && second <= 12) dayFirst = true;
    if (second > 12 && first <= 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return "DMY";
  if (monthFirst && !dayFirst) return "MDY";
  return fallback;
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** `Apr`, `April`, `APR.` and `Sept` -- but not any word that merely starts like a month. */
function monthFromName(word: string): number | null {
  const lower = word.toLowerCase();
  if (lower.length < 3) return null;
  if (lower === "sept") return 9;
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(lower));
  return index === -1 ? null : index + 1;
}

function expandYear(year: string): number {
  // Two-digit years only ever appear on documents still current, so 20YY.
  return year.length === 2 ? 2000 + Number(year) : Number(year);
}

/** `YYYY-MM-DD`, or null unless it is a real calendar date in a plausible range. */
export function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function numericDate(first: number, second: number, year: number, order: DateOrder): string | null {
  // A part over 12 can only be the day, whatever the locale says.
  if (first > 12 && second <= 12) return isoDate(year, second, first);
  if (second > 12 && first <= 12) return isoDate(year, first, second);
  // Year-first locales still print short dates day-first or month-first; day-first is the wider convention.
  return order === "MDY" ? isoDate(year, first, second) : isoDate(year, second, first);
}

export type FoundDate = { iso: string; index: number; end: number };

const PATTERNS: { pattern: RegExp; read: (match: RegExpExecArray, order: DateOrder) => string | null }[] = [
  // 2027-04-03, 2027/04/03
  {
    pattern: /\b(\d{4})([-/.])(\d{1,2})\2(\d{1,2})\b/g,
    read: (m) => isoDate(Number(m[1]), Number(m[3]), Number(m[4])),
  },
  // 03/04/2027, 03.04.27, 03 04 2027 -- the same separator both times.
  {
    pattern: /\b(\d{1,2})([-/. ])(\d{1,2})\2(\d{4}|\d{2})\b/g,
    read: (m, order) => numericDate(Number(m[1]), Number(m[3]), expandYear(m[4]), order),
  },
  // 03 APR 2027, 3 April 2027, 03APR2027, 03 APR /AVR 27 (bilingual passports)
  {
    pattern: /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-./]*([A-Za-z]{3,9})\.?(?:\s*\/\s*[A-Za-z]{3,9}\.?)?[\s\-.,/]*(\d{4}|\d{2})\b/g,
    read: (m) => {
      const month = monthFromName(m[2]);
      return month ? isoDate(expandYear(m[3]), month, Number(m[1])) : null;
    },
  },
  // April 3, 2027 / Apr 3 2027
  {
    pattern: /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g,
    read: (m) => {
      const month = monthFromName(m[1]);
      return month ? isoDate(Number(m[3]), month, Number(m[2])) : null;
    },
  },
];

/** Every date in `text`, left to right, with overlapping readings resolved to the earliest and longest. */
export function findDates(text: string, order: DateOrder): FoundDate[] {
  const found: FoundDate[] = [];
  for (const { pattern, read } of PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const iso = read(match, order);
      if (iso) found.push({ iso, index: match.index, end: match.index + match[0].length });
    }
  }
  found.sort((a, b) => a.index - b.index || b.end - a.end);
  const kept: FoundDate[] = [];
  for (const date of found) {
    if (kept.length === 0 || date.index >= kept[kept.length - 1].end) kept.push(date);
  }
  return kept;
}
