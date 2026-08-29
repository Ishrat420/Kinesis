const LOCALE = "en-AU";
const DAY_MS = 86_400_000;

export type DateInput = Date | string | number;

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const shortMonthFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const agendaDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const calendarDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

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

function requiredDate(value: DateInput) {
  const date = toDate(value);
  if (!date) throw new RangeError("Invalid date value");
  return date;
}

export const formatDate = (value: DateInput) => dateFormatter.format(requiredDate(value));
export const formatMonthHeading = (value: DateInput) => monthFormatter.format(requiredDate(value));
export const formatShortMonthYear = (value: DateInput) => shortMonthFormatter.format(requiredDate(value));
export const formatAgendaDate = (value: DateInput) => agendaDateFormatter.format(requiredDate(value));
export const formatCalendarDate = (value: DateInput) => calendarDateFormatter.format(requiredDate(value));

export function formatTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new RangeError("Invalid time value");
  return timeFormatter.format(new Date(Date.UTC(2020, 0, 1, Number(match[1]), Number(match[2]))));
}

export function differenceInCalendarDays(target: DateInput, now: DateInput = new Date()) {
  const targetDay = startOfUtcDay(target);
  const currentDay = startOfUtcDay(now);
  if (!targetDay || !currentDay) throw new RangeError("Invalid date value");
  return Math.round((targetDay.getTime() - currentDay.getTime()) / DAY_MS);
}

function unit(value: number, name: string) {
  return `${value} ${name}${value === 1 ? "" : "s"}`;
}

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

export function formatDeadline(target: DateInput, now: DateInput = new Date()) {
  const days = differenceInCalendarDays(target, now);
  if (days < 0) return `${unit(Math.abs(days), "day")} overdue`;
  if (days === 0) return "due today";
  if (days < 60) return `${unit(days, "day")} left`;
  return `${formatCalendarDuration(now, target)} left`;
}

export function formatFutureDate(target: DateInput, now: DateInput = new Date()) {
  const days = differenceInCalendarDays(target, now);
  if (days < 0) return `${unit(Math.abs(days), "day")} ago`;
  if (days === 0) return "today";
  return `in ${days < 60 ? unit(days, "day") : formatCalendarDuration(now, target)}`;
}

export function formatExpiry(target: DateInput, now: DateInput = new Date()) {
  const days = differenceInCalendarDays(target, now);
  if (days < 0) return `${unit(Math.abs(days), "day")} expired`;
  if (days === 0) return "expires today";
  return `${days < 60 ? unit(days, "day") : formatCalendarDuration(now, target)} left`;
}

export function formatActivityTime(value: DateInput, now: DateInput = new Date()) {
  const date = requiredDate(value);
  const reference = requiredDate(now);
  const seconds = Math.max(0, Math.floor((reference.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${unit(Math.floor(seconds / 60), "minute")} ago`;
  if (seconds < DAY_MS / 1000) return `${unit(Math.floor(seconds / 3_600), "hour")} ago`;
  if (seconds < 7 * DAY_MS / 1000) return `${unit(Math.floor(seconds / (DAY_MS / 1000)), "day")} ago`;
  return formatDate(date);
}
