import type { NotificationType } from "@prisma/client";
import { formatDateInput, type DateInput } from "@/lib/dates";

/**
 * Needs Attention rows a person can dismiss.
 *
 * A milestone and a to-do are both deliberately absent: KD-017 gives each
 * "Mark complete" and "Reschedule" instead, on the reasoning that hiding an
 * unfinished item without either resolving it or moving it just buries real
 * work. The card renders no Dismiss button for either, and `parseDismissalKey`
 * rejects both their keys, so the two sides agree rather than drifting apart.
 */
export type DismissibleKind = "document" | "custom";

/**
 * What a dismissal of each kind may actually be about: its advance notice,
 * or the one overdue notice that eventually replaces it. Kept as its own
 * whitelist, rather than accepting any `NotificationType`, for the same
 * reason `DismissibleKind` is its own type rather than all of
 * `NotificationSource` -- a milestone's `MILESTONE_DUE` naming a "document"
 * dismissal would be meaningless, and this is what keeps it unreachable.
 */
const DISMISSIBLE_TYPES = {
  document: ["REMINDER_DUE", "EXPIRED"],
  custom: ["REMINDER_DUE", "CUSTOM_ITEM_DUE"],
} as const satisfies Record<DismissibleKind, readonly NotificationType[]>;

const DISMISSIBLE_KINDS = Object.keys(DISMISSIBLE_TYPES) as DismissibleKind[];

/** Whether a Needs Attention row of this kind offers a Dismiss button. */
export function isDismissibleKind(kind: string): kind is DismissibleKind {
  return (DISMISSIBLE_KINDS as readonly string[]).includes(kind);
}

function isDismissibleType(kind: DismissibleKind, type: string): type is NotificationType {
  return (DISMISSIBLE_TYPES[kind] as readonly string[]).includes(type);
}

/**
 * The identity of a dismissal: an item **saying one particular thing, about
 * one particular deadline** -- never the item or the deadline alone.
 *
 * The notification type is part of the identity for the same reason
 * `notificationKey` (lib/notifications/identity.ts) already carries one: an
 * advance notice ("expiring soon" / "due soon") and the overdue notice that
 * later replaces it, at that very same deadline, are two different things to
 * dismiss. Upcoming & Due offers Dismiss on both phases; without the type in
 * this key, dismissing the advance notice would silently dismiss the overdue
 * one too, the moment it later arrived, since both would otherwise share the
 * one `kind:id:date` string. Reaching a deadline must surface the overdue
 * notice fresh, not find it already gone because the advance notice once was.
 *
 * A dismissal is permanent for as long as both the deadline and what is being
 * said about it stand. Edit the date, and the old key -- date and all --
 * simply stops being reachable; there is nothing to revive by hand.
 */
export function dismissalKey(kind: string, id: string, type: NotificationType, date: DateInput) {
  return `${kind}:${id}:${type}:${formatDateInput(date)}`;
}

/** Reads a dismissal key back, or null if it is not one a person may dismiss. */
export function parseDismissalKey(key: string): { kind: DismissibleKind; id: string; type: NotificationType; date: string } | null {
  const match = /^([a-z]+):([^:]+):([A-Z_]+):(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (!match) return null;

  const [, kind, id, type, date] = match;
  if (!isDismissibleKind(kind) || !isDismissibleType(kind, type)) return null;
  return { kind, id, type, date };
}
