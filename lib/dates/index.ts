import { DEFAULT_LOCALE } from "@/lib/format/preferences";

const DAY_MS = 86_400_000;

export type DateInput = Date | string | number;

/**
 * Every formatter here renders in UTC.
 *
 * Kinesis stores calendar dates — expiry, issue, due and target dates — at UTC
 * midnight, where they represent a day rather than an instant. Rendering them
 * in any other zone moves them by a day. Timestamps (createdAt, completedAt)
 * are real instants and currently share that treatment, which is what the
 * application has always done.
 *
 * The owner's zone decides one thing only, and it is not rendering: which day
 * *today* is. `startOfDayIn` below answers that; everything here still renders
 * in UTC, because a calendar date shifted into a zone would move by a day.
 *
 * `formatActivityTime` is the exception that proves the rule. It measures an
 * elapsed instant -- "3 minutes ago" -- rather than deciding a day, so it keeps
 * its `new Date()` default while every day-deciding helper below lost theirs.
 */
const SHAPES = {
  date: { day: "numeric", month: "short", year: "numeric" },
  monthHeading: { month: "long", year: "numeric" },
  shortMonthYear: { month: "short", year: "numeric" },
  agendaDate: { weekday: "short", day: "numeric", month: "long" },
  calendarDate: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const cached = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Reads a zone's local calendar date. Falls back to UTC on a zone this runtime
 * rejects, for the same reason `formatter` falls back on a locale: knowing what
 * day it is must not be the thing that takes a page down.
 */
function dayFormatter(timeZone: string) {
  const existing = dayFormatters.get(timeZone);
  if (existing) return existing;
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  let instance: Intl.DateTimeFormat;
  try {
    instance = new Intl.DateTimeFormat("en-CA", { ...options, timeZone });
  } catch {
    instance = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
  }
  dayFormatters.set(timeZone, instance);
  return instance;
}

function formatter(shape: keyof typeof SHAPES, locale: string) {
  const key = `${shape}|${locale}`;
  const existing = cached.get(key);
  if (existing) return existing;

  const options = { ...SHAPES[shape], timeZone: "UTC" };
  let instance: Intl.DateTimeFormat;
  try {
    instance = new Intl.DateTimeFormat(locale, options);
  } catch {
    // A stored locale this runtime's ICU build rejects must not take down every
    // page that renders a date.
    instance = new Intl.DateTimeFormat(DEFAULT_LOCALE, options);
  }
  cached.set(key, instance);
  return instance;
}

/**
 * The calendar day it is *for the owner*, denoted -- like every stored date --
 * by UTC midnight.
 *
 * This is the one place the owner's zone enters the date layer, and it exists
 * because "today" was being read as `startOfUtcDay(new Date())`: the UTC day,
 * not their day. On UTC+10 that is yesterday until 10am, so until mid-morning
 * every countdown, overdue badge and calendar highlight in Kinesis was a day
 * behind. Everything a date is compared *against* is unchanged -- both sides
 * are still a day at UTC midnight, so every existing comparison still holds.
 *
 * Going through `Intl` rather than adding an offset is what makes daylight
 * saving a non-event: the zone decides the local calendar date, and the result
 * is whole UTC days from there.
 */
export function startOfDayIn(timeZone: string, instant: DateInput = new Date()): Date {
  const date = toDate(instant);
  if (!date) throw new RangeError("Invalid date value");
  const parts = dayFormatter(timeZone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

/** Parse a date-only value without allowing the host timezone to change its day. */
export function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]) ? date : null;
}

function toDate(value: DateInput) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseDateOnly(value)
    : new Date(value);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function startOfUtcDay(value: DateInput) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Serialize a calendar date for native date inputs and stable date keys. */
export function formatDateInput(value: DateInput) {
  const date = startOfUtcDay(value);
  if (!date) throw new RangeError("Invalid date value");
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Add whole calendar days without introducing local-time or DST shifts. */
export function addUtcDays(value: DateInput, amount: number) {
  if (!Number.isInteger(amount)) throw new RangeError("Day amount must be an integer");
  const date = startOfUtcDay(value);
  if (!date) throw new RangeError("Invalid date value");
  date.setUTCDate(date.getUTCDate() + amount);
  return date;
}

function requiredDate(value: DateInput) {
  const date = toDate(value);
  if (!date) throw new RangeError("Invalid date value");
  return date;
}

export const formatDate = (value: DateInput, locale = DEFAULT_LOCALE) =>
  formatter("date", locale).format(requiredDate(value));
export const formatMonthHeading = (value: DateInput, locale = DEFAULT_LOCALE) =>
  formatter("monthHeading", locale).format(requiredDate(value));
export const formatShortMonthYear = (value: DateInput, locale = DEFAULT_LOCALE) =>
  formatter("shortMonthYear", locale).format(requiredDate(value));
export const formatAgendaDate = (value: DateInput, locale = DEFAULT_LOCALE) =>
  formatter("agendaDate", locale).format(requiredDate(value));
export const formatCalendarDate = (value: DateInput, locale = DEFAULT_LOCALE) =>
  formatter("calendarDate", locale).format(requiredDate(value));

export function formatTime(value: string, locale = DEFAULT_LOCALE) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new RangeError("Invalid time value");
  return formatter("time", locale).format(new Date(Date.UTC(2020, 0, 1, Number(match[1]), Number(match[2]))));
}

export function differenceInCalendarDays(target: DateInput, today: DateInput) {
  const targetDay = startOfUtcDay(target);
  const currentDay = startOfUtcDay(today);
  if (!targetDay || !currentDay) throw new RangeError("Invalid date value");
  return Math.round((targetDay.getTime() - currentDay.getTime()) / DAY_MS);
}

function unit(value: number, name: string) {
  return `${value} ${name}${value === 1 ? "" : "s"}`;
}

/**
 * The point past which a plain day count (e.g. "83 days left") stops being a
 * useful way to read a countdown and a calendar breakdown (e.g. "2 months, 23
 * days left") reads better instead. `formatDeadline`, `formatFutureDate` and
 * `formatExpiry` below all switch at this one value, and the notification
 * engine reuses it for the equivalent "expires in N days" wording -- change
 * it here and every one of those follows.
 */
export const DAY_COUNT_DISPLAY_LIMIT_DAYS = 60;

/** Calendar-aware duration used by future dates and document expiry labels. */
export function formatCalendarDuration(from: DateInput, to: DateInput) {
  const start = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  if (!start || !end || end < start) throw new RangeError("Duration end must not precede its start");
  const cursor = new Date(start);
  let years = end.getUTCFullYear() - cursor.getUTCFullYear();
  cursor.setUTCFullYear(cursor.getUTCFullYear() + years);
  if (cursor > end) { years -= 1; cursor.setUTCFullYear(cursor.getUTCFullYear() - 1); }
  let months = (end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + end.getUTCMonth() - cursor.getUTCMonth();
  cursor.setUTCMonth(cursor.getUTCMonth() + months);
  if (cursor > end) { months -= 1; cursor.setUTCMonth(cursor.getUTCMonth() - 1); }
  const days = Math.round((end.getTime() - cursor.getTime()) / DAY_MS);
  return [years ? unit(years, "year") : "", months ? unit(months, "month") : "", days || (!years && !months) ? unit(days, "day") : ""].filter(Boolean).join(", ");
}

export function formatDeadline(target: DateInput, today: DateInput) {
  const days = differenceInCalendarDays(target, today);
  if (days < 0) return `${unit(Math.abs(days), "day")} overdue`;
  if (days === 0) return "due today";
  if (days < DAY_COUNT_DISPLAY_LIMIT_DAYS) return `${unit(days, "day")} left`;
  return `${formatCalendarDuration(today, target)} left`;
}

export function formatFutureDate(target: DateInput, today: DateInput) {
  const days = differenceInCalendarDays(target, today);
  if (days < 0) return `${unit(Math.abs(days), "day")} ago`;
  if (days === 0) return "today";
  return `in ${days < DAY_COUNT_DISPLAY_LIMIT_DAYS ? unit(days, "day") : formatCalendarDuration(today, target)}`;
}

export function formatExpiry(target: DateInput, today: DateInput) {
  const days = differenceInCalendarDays(target, today);
  if (days < 0) return `${unit(Math.abs(days), "day")} expired`;
  if (days === 0) return "expires today";
  return `${days < DAY_COUNT_DISPLAY_LIMIT_DAYS ? unit(days, "day") : formatCalendarDuration(today, target)} left`;
}

export function formatActivityTime(value: DateInput, now: DateInput = new Date(), locale = DEFAULT_LOCALE) {
  const date = requiredDate(value);
  const reference = requiredDate(now);
  const seconds = Math.max(0, Math.floor((reference.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${unit(Math.floor(seconds / 60), "minute")} ago`;
  if (seconds < DAY_MS / 1000) return `${unit(Math.floor(seconds / 3_600), "hour")} ago`;
  if (seconds < 7 * DAY_MS / 1000) return `${unit(Math.floor(seconds / (DAY_MS / 1000)), "day")} ago`;
  return formatDate(date, locale);
}
