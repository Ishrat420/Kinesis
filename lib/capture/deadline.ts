import * as chrono from "chrono-node";
import { dateOrderFor, documentDateOrder } from "@/lib/documents/extraction/dates";

/**
 * The date a piece of text asks for (KD-057, ADR-018): "by 12 Nov", "before
 * 10/23/26", "due by next week", found among everything else an email or a
 * letter says -- its sent date, a signature, a date in passing.
 *
 * Rules, not AI, and "blank, not wrong" (ADR-017):
 *
 * - A deadline is a date introduced by a cue. Strong cues ("due", "deadline",
 *   "no later than", "on or before", "pay by", "renew by", "reply by") beat
 *   weak ones ("by", "before", "until"); if the strongest cued dates
 *   disagree, nothing is suggested.
 * - An uncued date counts only in a short capture with exactly one date in
 *   it ("call dentist tomorrow"), where it can't mean anything else.
 * - Header dates ("Sent:", "Date:", "On … wrote:") are never deadlines. They
 *   are what "tomorrow" and "next week" count from: an email sent last week
 *   saying "by tomorrow" meant the day after it was sent.
 * - With no header and `relativeNeedsAnchor` (a file, whose writing date is
 *   unknown), relative phrases are skipped; absolute dates still count.
 * - The date order comes from the text when one of its dates gives it away
 *   ("10/23/26" can only be month first), else from the owner's locale.
 */

export type Deadline = {
  dueDate: string;
  /** A day and month with no year that had already passed, so set for next year. */
  rolledToNextYear?: boolean;
  /** Where the date phrase sits in the text, for building a title around it. */
  index: number;
  end: number;
};

type Options = {
  /** YYYY-MM-DD in the owner's own time zone. */
  today: string;
  locale: string;
  /** Accept one uncued date when it's the only date there (short typed captures). */
  allowUncued?: boolean;
  /** Skip relative phrases unless the text says when it was written (files). */
  relativeNeedsAnchor?: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** A month and a two-digit number chrono read as a year: "dec 20" is 20 December, not December 2020. */
const MONTH_THEN_NUMBER = /^[a-z]{3,9}\.?\s+(\d{1,2})$/i;
const MONTH_NAME = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;

/** "by COB Friday", "by EOD tomorrow": office shorthand between a cue and its date. */
const END_OF_DAY = "(?:(?:cob|eod|close\\s+of\\s+business|end\\s+of\\s+(?:the\\s+)?day)\\s+(?:on\\s+)?)?";
/** Before the date phrase, within a few words of it. */
const STRONG_CUE = new RegExp(`\\b(?:due(?:\\s+(?:date|by|on|before))?|deadline(?:\\s+is)?|no\\s+later\\s+than|on\\s+or\\s+before|(?:pay|payment|renew|renewal|reply|respond|submit|lodge|return|complete|send|register)(?:\\s+(?:is\\s+)?(?:due\\s+)?(?:by|before|on))|expires?(?:\\s+on)?|expiring(?:\\s+on)?|closes?(?:\\s+on)?)\\s*[:,–-]?\\s*(?:the\\s+|is\\s+)?${END_OF_DAY}$`, "i");
const WEAK_CUE = new RegExp(`\\b(?:by|before|until|till)\\s*[:,]?\\s*(?:the\\s+)?${END_OF_DAY}$`, "i");

/**
 * Header lines whose date is when the message was written, not a deadline:
 * Outlook's "Sent:", "Date:", a reply's "On … wrote:", and Gmail's sender
 * line, which prints the date beside the address ("Sam Lee <sam@x.com>
 * Fri, Oct 16, 2026 at 10:23 AM").
 */
const HEADER_LINE = /^[ \t>]*(?:(?:sent|date|received)\s*:.*|on\s+.+\bwrote\s*:?|.*<[^<>\s@]+@[^<>\s]+>[ \t]+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?[ \t].*\d{4}.*)[ \t]*$/gim;
/**
 * The header and footer a browser prints on each page: "10/22/26, 12:24 PM
 * Gmail - <subject>". Its date is when it was printed, so it is neither a
 * deadline nor what "next week" counts from; its title is the subject.
 */
const PRINT_LINE = /^[ \t]*\d{1,2}\/\d{1,2}\/\d{2,4},[ \t]+\d{1,2}:\d{2}[ \t]*[ap]m\b[ \t]*(.*)$/gim;

/**
 * "mid next week", "early next week", "end of this week": parts of a week
 * that chrono doesn't know (it reads "mid next week" as "next week", seven
 * days on). Mid is the Wednesday, early the Monday, the end the Friday --
 * the working week, since that is what such emails mean.
 */
const WEEK_PART = /\b(mid-?|middle\s+of|early|start\s+of|beginning\s+of|end\s+of|late)\s*(?:the\s+)?(next|this|the)?\s*week\b/i;
const weekPartParser = {
  pattern: () => WEEK_PART,
  extract: (context: chrono.ParsingContext, match: RegExpMatchArray) => {
    const reference = context.reference.instant;
    const part = match[1].toLowerCase();
    const next = match[2]?.toLowerCase() === "next";
    // Monday of the week meant.
    const monday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - ((reference.getDay() + 6) % 7) + (next ? 7 : 0), 12);
    const offset = part.startsWith("mid") ? 2 : part === "early" || part.startsWith("start") || part.startsWith("beginning") ? 0 : 4;
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset, 12);
    return { day: day.getDate(), month: day.getMonth() + 1, year: day.getFullYear() };
  },
};
const withWeekParts = (base: chrono.Chrono) => {
  const parser = base.clone();
  parser.parsers.unshift(weekPartParser);
  return parser;
};
const MONTH_FIRST = withWeekParts(chrono.en.casual);
const DAY_FIRST = withWeekParts(chrono.en.GB);

/** Real calendar days only: 31 February is not a due date. */
export function isRealDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The date a result names. `monthDay` is set when the text wrote a day and
 * month but no year ("Sept 24th", "30/11"): the year is then decided by the
 * caller. Relative phrases ("tomorrow", "Friday", "in 2 weeks") come back
 * whole, as chrono resolved them forward from the reference day.
 */
export function dateFrom(result: chrono.ParsedResult): { iso: string } | { monthDay: string } | null {
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

/** Relative phrases ("tomorrow", "next week", "Friday", "in 2 weeks") name no date of their own. */
const isRelative = (text: string) => !MONTH_NAME.test(text) && !/\d{1,4}\s*[/.-]\s*\d{1,2}/.test(text) && !/\b\d{4}\b/.test(text);

/** Noon on a calendar day, in the device's own zone: chrono reads weekdays and "tomorrow" in local time. */
function noonOf(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function parserFor(text: string, locale: string) {
  return documentDateOrder(text, dateOrderFor(locale)) === "MDY" ? MONTH_FIRST : DAY_FIRST;
}

type Candidate = { iso: string; rolled: boolean; index: number; end: number; strength: 0 | 1 | 2 };

export function findDeadline(text: string, { today, locale, allowUncued = false, relativeNeedsAnchor = false }: Options): Deadline | undefined {
  const parser = parserFor(text, locale);

  // When the message was written -- the latest sent date, in a thread -- and where its header lines are.
  const headers: [number, number][] = [...text.matchAll(PRINT_LINE)].map((match) => [match.index, match.index + match[0].length]);
  let anchor: string | undefined;
  for (const match of text.matchAll(HEADER_LINE)) {
    headers.push([match.index, match.index + match[0].length]);
    const sent = parser.parse(match[0], noonOf(today))[0];
    if (sent && sent.start.isCertain("year") && sent.start.isCertain("day")) {
      const iso = `${sent.start.get("year")}-${pad(sent.start.get("month")!)}-${pad(sent.start.get("day")!)}`;
      if (!anchor || iso > anchor) anchor = iso;
    }
  }
  const reference = anchor ?? today;
  const inHeader = (index: number) => headers.some(([from, to]) => index >= from && index < to);

  const candidates: Candidate[] = [];
  for (const result of parser.parse(text, noonOf(reference), { forwardDate: true })) {
    if (result.end || inHeader(result.index)) continue;
    if (isRelative(result.text) && relativeNeedsAnchor && !anchor) continue;
    const found = dateFrom(result);
    if (!found) continue;
    let iso: string;
    let rolled = false;
    if ("iso" in found) {
      iso = found.iso;
    } else {
      // A day and month with no year: the reference year, unless that day had already gone.
      const year = Number(reference.slice(0, 4));
      iso = `${year}-${found.monthDay}`;
      if (iso < reference) {
        iso = `${year + 1}-${found.monthDay}`;
        rolled = true;
      }
    }
    if (!isRealDate(iso)) continue;
    const before = text.slice(Math.max(0, result.index - 40), result.index);
    const strength = STRONG_CUE.test(before) ? 2 : WEAK_CUE.test(before) ? 1 : 0;
    candidates.push({ iso, rolled, index: result.index, end: result.index + result.text.length, strength });
  }

  const pick = (group: Candidate[]) => (new Set(group.map((candidate) => candidate.iso)).size === 1 ? group[0] : undefined);
  const strongest = Math.max(0, ...candidates.map((candidate) => candidate.strength));
  const chosen = strongest > 0
    ? pick(candidates.filter((candidate) => candidate.strength === strongest))
    : allowUncued && candidates.length === 1 ? candidates[0] : undefined;
  if (!chosen) return undefined;
  return { dueDate: chosen.iso, index: chosen.index, end: chosen.end, ...(chosen.rolled && !anchor ? { rolledToNextYear: true } : {}) };
}

/** Said before the action itself; never part of a to-do's name. */
const LEADING_FILLER = /^(?:(?:hi|hello|hey|dear)\b[^,.!\n]{0,40}[,!]\s*)?(?:(?:just\s+)?(?:a\s+)?(?:friendly\s+)?reminder(?:\s+that)?[:,]?\s*)?(?:(?:if\s+you\s+(?:can|could)|(?:can|could|would)\s+you(?:\s+each)?)(?:\s+please)?\s+)?(?:please\s+|kindly\s+)?(?:(?:i\s+)?(?:really\s+)?(?:need|have|got|want)\s+to\s+|gotta\s+|must\s+|remember\s+to\s+|remind\s+me\s+to\s+|don'?t\s+forget\s+to\s+|to-?do:?\s+|todo:?\s+)?/i;
/** Politeness after the ask: "…, that would be great", "…, thanks". */
const TRAILING_FILLER = /[\s,;:-]+(?:that\s+would\s+be\s+(?:great|good|ideal|appreciated|perfect)|thanks?(?:\s+(?:so\s+much|you))?|cheers|if\s+possible|please)\b[\s\S]*$/i;
/** Words that only introduce the date: "by Sept 24th", "on Friday", "due tomorrow". */
const TRAILING_CONNECTOR = /(?:\s+(?:by|on|before|due|until|till|for|at|from|due\s+by|no\s+later\s+than|on\s+or\s+before))?(?:\s+(?:cob|eod|close\s+of\s+business|end\s+of\s+(?:the\s+)?day)(?:\s+on)?)?\s*$/i;
/** Long enough to read in a list; anything longer is the body of a message, not its title. */
const MAX_TITLE = 120;

export function cleanTitle(text: string) {
  let title = text.replace(/\s+/g, " ").trim().replace(LEADING_FILLER, "").replace(TRAILING_FILLER, "").replace(/[\s,;:.?!-]+$/, "").trim();
  if (title.length > MAX_TITLE) title = `${title.slice(0, title.lastIndexOf(" ", MAX_TITLE) > 40 ? title.lastIndexOf(" ", MAX_TITLE) : MAX_TITLE)}…`;
  return title.charAt(0).toLocaleUpperCase() + title.slice(1);
}

/** The date phrase taken out, with the word that introduced it. */
export function withoutDate(text: string, deadline: { index: number; end: number }) {
  const before = text.slice(0, deadline.index).replace(TRAILING_CONNECTOR, "");
  return `${before} ${text.slice(deadline.end)}`.replace(/\s+/g, " ").trim();
}

/** A short title that only points at something said before it. */
const VAGUE = /^.{0,40}\b(?:it|them|this|these|those)\b.{0,20}$/i;
/** An ask, from its verb on: "can you please send me your feedback" → "send me your feedback". */
const REQUEST = /\b(?:(?:can|could|would)\s+you(?:\s+(?:each|all))?(?:\s+please)?|please)\s+([a-z][^.?!\n]{5,})/gi;

/**
 * A title for a long piece of text: its subject line when it has one,
 * otherwise the sentence the deadline is in, otherwise its first line.
 */
export function titleOf(text: string, deadline?: { index: number; end: number }) {
  // A "Subject:" line, else the subject a browser prints in its page header ("10/22/26, 12:24 PM   Gmail - <subject>").
  PRINT_LINE.lastIndex = 0;
  const printed = PRINT_LINE.exec(text)?.[1].replace(/^.*?\s-\s/, "");
  PRINT_LINE.lastIndex = 0;
  const subject = (/^[ \t]*subject\s*:\s*(.+)$/im.exec(text)?.[1] ?? printed)?.replace(/^(?:(?:re|fwd?|fw)\s*:\s*)+/i, "").trim();
  if (subject) return cleanTitle(subject);
  if (deadline) {
    // The sentence around the date, without lookbehind (older iOS Safari can't parse it).
    let from = deadline.index;
    while (from > 0 && !/[.!?\n]/.test(text[from - 1])) from--;
    let to = deadline.end;
    while (to < text.length && !/[.!?\n]/.test(text[to])) to++;
    const sentence = cleanTitle(withoutDate(text.slice(from, to), { index: deadline.index - from, end: deadline.end - from }));
    // "Get them to me": what "them" is was asked for earlier -- "can you please send me your feedback".
    if (VAGUE.test(sentence)) {
      const asked = [...text.slice(0, from).matchAll(REQUEST)].pop()?.[1];
      if (asked) return cleanTitle(asked);
    }
    if (sentence.length >= 3) return sentence;
  }
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !HEADER_LINE.test(line)) ?? text;
  HEADER_LINE.lastIndex = 0;
  return cleanTitle(firstLine);
}
