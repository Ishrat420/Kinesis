import type { FieldLink, ObjectField } from "@prisma/client";
import type { CustomFieldValue } from "./types";

type StoredField = ObjectField & { links: FieldLink[] };

/**
 * A stored field's shape, presented the way every reader already expects:
 * `targetObjectIds` as a flat, ordered array rather than the `links` relation
 * it is actually stored as. One place this happens, since every host --
 * Documents, Custom Items, Goals -- reads its fields the same way.
 */
export function presentCustomFields(fields: StoredField[]): CustomFieldValue[] {
  return fields.map(({ links, ...field }) => ({ ...field, targetObjectIds: links.map((link) => link.targetObjectId) }));
}
