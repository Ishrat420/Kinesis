import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "./prisma";
import { KINESIS_LINK_TARGET_TYPES, kinesisLinkTargetOrder, type KinesisLinkOption, type KinesisLinkTargetType } from "@/lib/custom-fields/types";
import { locateObjects, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";
import { resolveKind, formatPreviewValue, type DisplayKind } from "@/lib/custom-fields/kinds";
import { getFormatPreferences, getToday } from "@/lib/format/server";

/** One configured preview field, already resolved and formatted, ready to render. */
export type KinesisLinkPreviewStat = { label: string; kind: DisplayKind; value: string };

/** Narrows a located object to one a Kinesis Link is allowed to point at. */
const isLinkTarget = (location: ObjectLocation): location is ObjectLocation & { type: KinesisLinkTargetType } =>
  KINESIS_LINK_TARGET_TYPES.some((type) => type === location.type);

/**
 * A sanity bound, not a real-world limit (the same role MAX_PEOPLE plays in
 * lib/relationships.ts) -- this reads on every page that offers a Kinesis
 * Link picker, whether or not it's ever opened, so an account's linkable
 * object count should not be able to grow that read unboundedly.
 */
const LINK_OPTIONS_CAP = 500;

/**
 * A link stores an object id and nothing else. The module a target belongs to
 * still decides how it is presented and where it opens, so that mapping lives
 * in lib/objects/locations rather than in the column -- and is shared with every
 * other surface that offers objects to point at.
 */
export async function getKinesisLinkOptions(): Promise<KinesisLinkOption[]> {
  const objects = await prisma.object.findMany({
    where: { userId: (await requireKinesisUser()).id, type: { in: [...KINESIS_LINK_TARGET_TYPES] } },
    select: objectLocationSelect,
    orderBy: { name: "asc" },
    take: LINK_OPTIONS_CAP,
  });
  // Documents, then custom items, then goals, each already by name: the order the
  // picker has always grouped its modules in, read from each type's own `order`.
  return locateObjects(objects)
    .filter(isLinkTarget)
    .sort((first, second) => kinesisLinkTargetOrder(first.type) - kinesisLinkTargetOrder(second.type));
}

/**
 * The foreign key keeps links pointing at something real; this keeps them
 * pointing at something of yours.
 *
 * Returns the message to show, or null when every target checks out. It used to
 * throw, which meant a form whose picker had gone stale crashed the page
 * instead of saying so in the field the person was looking at.
 */
export async function validateKinesisTargets(fields: Array<{ targetObjectIds?: string[] }>): Promise<string | null> {
  const user = await requireKinesisUser();
  const targetIds = [...new Set(fields.flatMap(({ targetObjectIds }) => targetObjectIds ?? []))];
  if (!targetIds.length) return null;
  const owned = await prisma.object.count({
    where: { id: { in: targetIds }, userId: user.id, type: { in: [...KINESIS_LINK_TARGET_TYPES] } },
  });
  return owned === targetIds.length ? null : "One of the linked items no longer exists. Reopen the link field and choose again.";
}

/**
 * Rich preview data for a batch of linked objects (KD-042, ADR-013) -- read
 * live, batched by type, narrow (only the configured preview fields), rather
 * than one query per card. Phase 1: only Custom Items carry preview
 * configuration (`Template.previewFields`), so every other object type
 * resolves to nothing here and its card falls back to the compact one --
 * that's not a special case, just an empty result for a type this function
 * doesn't know how to look up yet.
 *
 * An id in `objectIds` with no key in the returned record means "render the
 * compact card": no preview configured, no template, or every configured
 * field came back empty -- KD-042 treats all three the same way.
 *
 * A plain record rather than a Map, since every caller passes this straight
 * on as a prop into a Client Component (`KinesisLinkCard`'s consumers) --
 * always JSON-safe, unlike a Map.
 */
export async function getKinesisLinkPreviews(objectIds: string[]): Promise<Record<string, KinesisLinkPreviewStat[]>> {
  const result: Record<string, KinesisLinkPreviewStat[]> = {};
  if (!objectIds.length) return result;

  const user = await requireKinesisUser();
  const [{ locale, currency }, today] = await Promise.all([getFormatPreferences(), getToday()]);

  const objects = await prisma.object.findMany({
    where: { id: { in: objectIds }, userId: user.id, type: "CUSTOM_ITEM", templateId: { not: null } },
    select: { id: true, templateId: true, customItem: { select: { dueDate: true } } },
  });
  if (!objects.length) return result;

  const templateIds = [...new Set(objects.map(({ templateId }) => templateId as string))];
  const templates = await prisma.template.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, previewFields: true, fields: { select: { id: true, label: true, type: true, numberFormat: true, isDueDate: true } } },
  });
  const templateById = new Map(templates.map((template) => [template.id, template]));

  // Only the fields actually named by some template's previewFields, so the
  // ObjectField fetch stays narrow (ADR-013) instead of pulling every field
  // on every one of these objects.
  const neededFieldIds = new Set<string>();
  for (const template of templates) {
    const fieldById = new Map(template.fields.map((field) => [field.id, field]));
    for (const id of template.previewFields.slice(0, 3)) {
      const field = fieldById.get(id);
      if (field && !field.isDueDate) neededFieldIds.add(id);
    }
  }

  const values = neededFieldIds.size
    ? await prisma.objectField.findMany({
        where: { objectId: { in: objects.map(({ id }) => id) }, templateFieldId: { in: [...neededFieldIds] } },
        select: { objectId: true, templateFieldId: true, value: true, links: { select: { id: true } } },
      })
    : [];
  const valueByKey = new Map(values.map((value) => [`${value.objectId}:${value.templateFieldId}`, value]));

  for (const object of objects) {
    const template = object.templateId ? templateById.get(object.templateId) : undefined;
    if (!template || !template.previewFields.length) continue;

    const fieldById = new Map(template.fields.map((field) => [field.id, field]));
    const stats: KinesisLinkPreviewStat[] = [];

    for (const fieldId of template.previewFields.slice(0, 3)) {
      // Dropped silently: a field removed from the template since it was
      // configured as a preview field reads exactly like one that resolved
      // empty (see the Template.previewFields comment).
      const field = fieldById.get(fieldId);
      if (!field) continue;
      const kind = resolveKind(field.type, field.numberFormat ?? undefined);
      if (!kind) continue;

      const raw = field.isDueDate
        ? { value: object.customItem?.dueDate ? object.customItem.dueDate.toISOString().slice(0, 10) : "" }
        : kind === "link-count"
        ? { linkCount: valueByKey.get(`${object.id}:${field.id}`)?.links.length ?? 0 }
        : { value: valueByKey.get(`${object.id}:${field.id}`)?.value ?? "" };

      const formatted = formatPreviewValue(kind, raw, { locale, currency, today });
      if (formatted !== null) stats.push({ label: field.label, kind, value: formatted });
    }

    if (stats.length) result[object.id] = stats;
  }

  return result;
}
