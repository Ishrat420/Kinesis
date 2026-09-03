import { formatDateInput, type DateInput } from "@/lib/dates";

/**
 * Needs Attention rows a person can dismiss.
 *
 * A milestone is deliberately absent: KD-017 gave it "Mark complete" and
 * "Reschedule" instead, on the reasoning that hiding an unfinished milestone
 * without either resolving it or moving it just buries real work. The card
 * renders no Dismiss button for one, and `parseDismissalKey` rejects its key,
 * so the two sides agree rather than drifting apart again.
 */
export type DismissibleKind = "document" | "custom" | "todo";

const DISMISSIBLE_KINDS = ["document", "custom", "todo"] as const satisfies readonly DismissibleKind[];

/** Whether a Needs Attention row of this kind offers a Dismiss button. */
export function isDismissibleKind(kind: string): kind is DismissibleKind {
  return (DISMISSIBLE_KINDS as readonly string[]).includes(kind);
}

/**
 * The identity of a dismissal: an item **at a specific deadline**, never the
 * item alone.
 *
 * A dismissal is permanent for as long as that deadline stands. Edit the
 * document's expiry date or the item's due date and the key no longer matches,
 * so the old dismissal stops applying and the row returns to Needs Attention
 * the next time the new date lapses. Editing the date is the signal, whatever
 * the new date is -- pushing it out, pulling it in, or correcting it to another
 * date already in the past all revive the item equally.
 *
 * The date is rendered in the same UTC yyyy-mm-dd every stored calendar date
 * uses, so a key never shifts a day with the reader's time zone.
 */
export function dismissalKey(kind: string, id: string, date: DateInput) {
  return `${kind}:${id}:${formatDateInput(date)}`;
}

/** Reads a dismissal key back, or null if it is not one a person may dismiss. */
export function parseDismissalKey(key: string): { kind: DismissibleKind; id: string; date: string } | null {
  const match = /^([a-z]+):([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (!match) return null;

  const [, kind, id, date] = match;
  return isDismissibleKind(kind) ? { kind, id, date } : null;
}
