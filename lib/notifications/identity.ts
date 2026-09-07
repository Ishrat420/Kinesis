import type { NotificationType } from "@prisma/client";
import { formatDateInput, type DateInput } from "@/lib/dates";

/**
 * Which record a notification is about.
 *
 * `relationship` is the odd one out: the key points at the important date, not
 * at the person, because a person can carry several and each reminds on its own.
 */
export const NOTIFICATION_SOURCES = ["document", "milestone", "relationship", "custom", "todo"] as const;
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number];

/** The column that ties a read marker back to its record, so a delete cascades. */
export const NOTIFICATION_LINK_FIELD = {
  document: "documentId",
  milestone: "milestoneId",
  relationship: "relationshipDateId",
  custom: "customItemId",
  todo: "todoId",
} as const satisfies Record<NotificationSource, string>;

/**
 * What makes two notifications the same notification.
 *
 * The record, what it is saying, and the deadline it is saying it about --
 * which is exactly what the dropped table's unique constraints held
 * (`userId, documentId, type, expiryDate` and its four siblings). Keeping that
 * identity keeps the behaviour that followed from it:
 *
 * - A reminder and the overdue notice that replaces it are separate things to
 *   have read. Reaching a deadline should speak again, not stay quietly read.
 * - Moving a deadline makes a new notification. The old key stops matching, so
 *   it returns unread -- the same mechanism `dismissalKey` uses for Needs
 *   Attention, and the reason a rescheduled thing does not stay dismissed.
 * - Renaming the record changes nothing. The old table stored the name, so an
 *   edit deleted and re-created the row and handed back a reminder that had
 *   already been read; nothing here is keyed on anything cosmetic.
 *
 * Deliberately not the same string as `dismissalKey`: a dismissal is only ever
 * about something overdue, while a notification also has an earlier, advance
 * form to have read separately. Sharing one key would let dismissing an overdue
 * item silently mark its reminder read as well.
 */
export function notificationKey(source: NotificationSource, id: string, type: NotificationType, deadline: DateInput) {
  return `${source}:${id}:${type}:${formatDateInput(deadline)}`;
}

/**
 * What a notification is saying about something already past its deadline.
 *
 * Needs Attention only ever lists overdue things, so for the kinds it can
 * dismiss the type is not a question -- each candidate function settles it the
 * moment the deadline is behind us. That makes a dismissal able to name the
 * notification it silences outright, rather than deriving the whole set to go
 * looking for it, so hiding the row and quieting the bell stay a single write.
 */
export const OVERDUE_NOTIFICATION_TYPE = {
  document: "EXPIRED",
  custom: "CUSTOM_ITEM_DUE",
  todo: "TODO_DUE",
} as const satisfies Partial<Record<NotificationSource, NotificationType>>;
