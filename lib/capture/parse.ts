import * as chrono from "chrono-node";
import { dateOrderFor } from "@/lib/documents/extraction/dates";

/**
 * What a typed capture means (KD-057, ADR-018): "need to make a dr's appt by
 * Sept 24th" becomes the title "Make a dr's appt", due 24 September.
 *
 * Deterministic and on the device: no AI, nothing sent anywhere. The same
 * rule as document extraction (ADR-017) applies -- blank, not wrong. A phrase
 * that could mean more than one date, a range, or a bare time sets no date at
 * all; the user picks one in the preview card instead.
 */

export type ParsedCapture = {
  /** The text with the date phrase and leading filler ("need to") removed. */
  title: string;
  /** YYYY-MM-DD, or absent when no single date was found. */
  dueDate?: string;
  /**
   * The text gave no year and the date had already passed this year, so it was
   * set for next year. The preview card says so, since it is the one guess the
   * parser makes on the user's behalf.
   */
  rolledToNextYear?: boolean;
};

/** Said before the action itself; never part of a to-do's name. */
const LEADING_FILLER = /^(?:(?:i\s+)?(?:really\s+)?(?:need|have|got|want)\s+to|gotta|must|remember\s+to|remind\s+me\s+to|don'?t\s+forget\s+to|to-?do:?|todo:?)\s+/i;
/** Words that only introduce the date: "by Sept 24th", "on Friday", "due tomorrow". */
const TRAILING_CONNECTOR = /\s+(?:by|on|before|due|until|till|for|at|from)\s*$/i;

const pad = (value: number) => String(value).padStart(2, "0");

/** A month and a two-digit number chrono read as a year: "dec 20" is 20 December, not December 2020. */
const MONTH_THEN_NUMBER = /^[a-z]{3,9}\.?\s+(\d{1,2})$/i;

/**
 * The date a result names. `monthDay` is set when the text wrote a day and
 * month but no year ("Sept 24th", "30/11"): the year is then decided by the
 * caller. Relative phrases ("tomorrow", "Friday", "in 2 weeks") come back
 * whole, as chrono resolved them forward from today.
 */
function dateFrom(result: chrono.ParsedResult): { iso: string } | { monthDay: string } | null {
  const start = result.start;
  const year = start.get("year");
  const month = start.get("month");
  const day = start.get("day");
  if (year === null || month === null || day === null) return null;

  const monthNumber = MONTH_THEN_NUMBER.exec(result.text.trim());
  if (monthNumber && start.isCertain("year") && !start.isCertain("day")) {
    const number = Number(monthNumber[1]);
    return number >= 1 && number <= 31 ? { monthDay: `${pad(month)}-${pad(number)}` } : null;
  }
  if (start.isCertain("day")) {
    return start.isCertain("year") ? { iso: `${year}-${pad(month)}-${pad(day)}` } : { monthDay: `${pad(month)}-${pad(day)}` };
  }
  // A weekday ("Friday") is a real day; a month and year ("Dec 2027") or a bare time ("3pm") is not.
  if (start.isCertain("weekday")) return { iso: `${year}-${pad(month)}-${pad(day)}` };
  return null;
}

/** Real calendar days only: 31 February is not a due date. */
function isRealDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function cleanTitle(text: string) {
  const title = text.replace(/\s+/g, " ").trim().replace(LEADING_FILLER, "").replace(/[\s,;:.-]+$/, "").trim();
  return title.charAt(0).toLocaleUpperCase() + title.slice(1);
}

/**
 * `today` is YYYY-MM-DD in the owner's own time zone (the same day the rest of
 * Kinesis calls today); `locale` settles 03/04 the way the owner writes dates.
 */
export function parseCapture(text: string, today: string, locale: string): ParsedCapture {
  const trimmed = text.trim();
  if (!trimmed) return { title: "" };

  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  // Noon on the owner's calendar day, in the device's own zone. chrono reads
  // weekdays and "tomorrow" in local time, so a UTC noon put Los Angeles at
  // 5 am -- and "by Friday", said on a Friday, came out as next Friday.
  const reference = new Date(todayYear, todayMonth - 1, todayDay, 12);
  const parser = dateOrderFor(locale) === "MDY" ? chrono.en : chrono.en.GB;
  const results = parser.parse(trimmed, reference, { forwardDate: true });

  // Two dates, or a range, could each be the one meant: suggest neither.
  if (results.length !== 1 || results[0].end) return { title: cleanTitle(trimmed) };

  const [result] = results;
  const found = dateFrom(result);
  if (!found) return { title: cleanTitle(trimmed) };
  const withoutDate = `${trimmed.slice(0, result.index)} ${trimmed.slice(result.index + result.text.length)}`;
  const title = cleanTitle(withoutDate.replace(/\s+/g, " ").trim().replace(TRAILING_CONNECTOR, ""));

  let iso: string;
  let rolledToNextYear = false;
  if ("iso" in found) {
    iso = found.iso;
  } else {
    // A day and month with no year: this year, unless that day has already gone.
    iso = `${todayYear}-${found.monthDay}`;
    if (iso < today) {
      iso = `${todayYear + 1}-${found.monthDay}`;
      rolledToNextYear = true;
    }
  }
  if (!isRealDate(iso)) return { title: cleanTitle(trimmed) };

  return { title: title || cleanTitle(trimmed), dueDate: iso, ...(rolledToNextYear ? { rolledToNextYear } : {}) };
}
