import { cleanTitle, findDeadline, titleOf, withoutDate } from "./deadline";

/**
 * What a typed or pasted capture means (KD-057, ADR-018): "need to make a dr's
 * appt by Sept 24th" becomes the title "Make a dr's appt", due 24 September;
 * a pasted email becomes its subject (or the sentence with the deadline),
 * due on the date it asks for.
 *
 * Deterministic and on the device: no AI, nothing sent anywhere. The same
 * rule as document extraction (ADR-017) applies -- blank, not wrong. See
 * `findDeadline` for which date counts.
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

/** One short line: a single date in it can only be the one meant, cue or not. */
const isShort = (text: string) => text.length <= 140 && !/\n/.test(text);
/** More than one sentence, or more than one line: a message, titled from its subject or deadline sentence. */
const isMessage = (text: string) => !isShort(text) || /[.!?]\s+\S/.test(text);

/**
 * `today` is YYYY-MM-DD in the owner's own time zone (the same day the rest of
 * Kinesis calls today); `locale` settles 03/04 the way the owner writes dates.
 */
export function parseCapture(text: string, today: string, locale: string): ParsedCapture {
  const trimmed = text.trim();
  if (!trimmed) return { title: "" };

  const deadline = findDeadline(trimmed, { today, locale, allowUncued: isShort(trimmed) });
  if (isMessage(trimmed)) {
    return { title: titleOf(trimmed, deadline), ...(deadline ? { dueDate: deadline.dueDate } : {}), ...(deadline?.rolledToNextYear ? { rolledToNextYear: true } : {}) };
  }
  if (!deadline) return { title: cleanTitle(trimmed) };
  const title = cleanTitle(withoutDate(trimmed, deadline));
  return { title: title || cleanTitle(trimmed), dueDate: deadline.dueDate, ...(deadline.rolledToNextYear ? { rolledToNextYear: true } : {}) };
}
