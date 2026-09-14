import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "./prisma";
import { KINESIS_LINK_TARGET_TYPES, kinesisLinkTargetOrder, type KinesisLinkOption, type KinesisLinkTargetType } from "@/lib/custom-fields/types";
import { locateObjects, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";
import { resolveKind, formatPreviewValue, type DisplayKind } from "@/lib/custom-fields/kinds";
import { getFormatPreferences, getToday } from "@/lib/format/server";
import { formatDateInput } from "@/lib/dates";
import { displayNumber } from "@/lib/goals/format";

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

/** What every per-Module preview builder below needs to format a raw value, gathered once rather than per builder. */
type PreviewFormatContext = { locale: string; currency: string; today: Date };

/** A `Date` column read back as the `yyyy-mm-dd` string `formatPreviewValue`'s `date` kind (via `parseDatedFieldValue`) already understands, or `""` when there's nothing to show. */
const toDateOnly = (date: Date | null) => date ? formatDateInput(date) : "";

/** Formats one field and wraps it as a stat, or drops it -- the one place every builder below turns a raw value into (or out of) a card, so "empty means omitted" (KD-042) is enforced once, not per Module. */
function buildStat(label: string, kind: DisplayKind, raw: { value?: string; linkCount?: number }, context: PreviewFormatContext): KinesisLinkPreviewStat | null {
  const formatted = formatPreviewValue(kind, raw, context);
  return formatted === null ? null : { label, kind, value: formatted };
}

/**
 * Custom Items' preview fields come from the `Template` they point to
 * (KD-035) rather than being hardcoded, since their field set is entirely
 * user-defined -- see `Template.previewFields` and the Template settings
 * page's "Show on card" picker. `templateId` lives on `Object`, not
 * `CustomItem`, so this reads `Object` first rather than `CustomItem`
 * directly, unlike the Document/Goal builders below.
 */
async function getCustomItemPreviews(objectIds: string[], userId: string, context: PreviewFormatContext): Promise<Record<string, KinesisLinkPreviewStat[]>> {
  const result: Record<string, KinesisLinkPreviewStat[]> = {};

  const objects = await prisma.object.findMany({
    where: { id: { in: objectIds }, userId, type: "CUSTOM_ITEM", templateId: { not: null } },
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
        ? { value: toDateOnly(object.customItem?.dueDate ?? null) }
        : kind === "link-count"
        ? { linkCount: valueByKey.get(`${object.id}:${field.id}`)?.links.length ?? 0 }
        : { value: valueByKey.get(`${object.id}:${field.id}`)?.value ?? "" };

      const stat = buildStat(field.label, kind, raw, context);
      if (stat) stats.push(stat);
    }

    if (stats.length) result[object.id] = stats;
  }

  return result;
}

/**
 * Documents have no Template, so their preview fields are a hardcoded
 * config shipped in code rather than something a Settings page configures
 * (KD-042's "Where This Is Configured" -- System Modules get no picker in
 * v1). `documentNumber`, `expiryDate` and `country` were chosen because
 * they're a document's own identity, not because they're the only option;
 * each already carries its own per-document label (`documentNumberLabel`
 * etc.), so the card reuses exactly the label the document itself was
 * given rather than a second, generic one.
 */
async function getDocumentPreviews(objectIds: string[], userId: string, context: PreviewFormatContext): Promise<Record<string, KinesisLinkPreviewStat[]>> {
  const result: Record<string, KinesisLinkPreviewStat[]> = {};

  const documents = await prisma.document.findMany({
    where: { objectId: { in: objectIds }, userId },
    select: {
      objectId: true,
      documentNumber: true, documentNumberLabel: true,
      expiryDate: true, expiryDateLabel: true,
      country: true, countryLabel: true,
    },
  });

  for (const document of documents) {
    const stats = [
      buildStat(document.documentNumberLabel, "text", { value: document.documentNumber ?? "" }, context),
      buildStat(document.expiryDateLabel, "date", { value: toDateOnly(document.expiryDate) }, context),
      buildStat(document.countryLabel, "text", { value: document.country ?? "" }, context),
    ].filter((stat): stat is KinesisLinkPreviewStat => stat !== null);
    if (stats.length) result[document.objectId] = stats;
  }

  return result;
}

/**
 * Goals have no Template either, so like Documents this is a hardcoded
 * config. Unlike every other builder here, neither stat is a plain column --
 * both are derived (a count over `milestones`, a fraction of `targetValue`)
 * -- so neither maps onto one of `resolveKind`'s `CustomFieldType`s. They're
 * built as plain sentences instead and passed through the `text` kind purely
 * for its "trim, cap length, drop if empty" behaviour, not because they're a
 * text field. Phrasing matches the goal's own detail page (`GoalPage`,
 * `displayNumber`) so a value never reads differently in the two places it
 * can appear.
 *
 * Each stat also honours the same `showMilestoneProgress`/
 * `showTargetProgress` toggles the goal's own page already uses to decide
 * whether that progress is worth showing at all -- a goal that hides its
 * milestone bar on its own page has already said that count isn't
 * meaningful, and a linked card showing it anyway would be a second,
 * disagreeing opinion about the same goal.
 */
async function getGoalPreviews(objectIds: string[], userId: string, { locale }: PreviewFormatContext): Promise<Record<string, KinesisLinkPreviewStat[]>> {
  const result: Record<string, KinesisLinkPreviewStat[]> = {};

  const goals = await prisma.goal.findMany({
    where: { objectId: { in: objectIds }, userId },
    select: {
      objectId: true, unit: true, targetValue: true, currentValue: true,
      showMilestoneProgress: true, showTargetProgress: true,
      milestones: { select: { completed: true } },
    },
  });

  for (const goal of goals) {
    const stats: KinesisLinkPreviewStat[] = [];

    if (goal.showMilestoneProgress && goal.milestones.length) {
      const completed = goal.milestones.filter((milestone) => milestone.completed).length;
      stats.push({ label: "Milestones", kind: "text", value: `${completed} of ${goal.milestones.length} complete` });
    }
    if (goal.showTargetProgress && goal.targetValue !== null) {
      const current = displayNumber(goal.currentValue ?? 0, goal.unit, locale);
      const target = displayNumber(goal.targetValue, goal.unit, locale);
      stats.push({ label: goal.unit || "Target", kind: "text", value: `${current} of ${target}` });
    }

    if (stats.length) result[goal.objectId] = stats;
  }

  return result;
}

/**
 * A Person has no "relationship type" field of its own -- that's the
 * Relationship module's `type`, and a Relationship isn't something a
 * Kinesis Link can point at (only `PERSON` is Object-backed; see KD-032).
 * `Person.category` is the closest practical equivalent already on the
 * record itself: the free-text tag ("Friend", "Partner", "Family"...) shown
 * under a bubble on the map. It's `null` for the self person, since "what
 * type of relationship is this to yourself" isn't a category anyone picks --
 * so the self card shows "You" instead of that column, exactly the value
 * `getRelationshipMap` already computes as `detail` for the same reason.
 * A single hardcoded stat, like Documents and Goals -- Person has no
 * Template either.
 */
async function getPersonPreviews(objectIds: string[], userId: string, context: PreviewFormatContext): Promise<Record<string, KinesisLinkPreviewStat[]>> {
  const result: Record<string, KinesisLinkPreviewStat[]> = {};

  const people = await prisma.person.findMany({
    where: { objectId: { in: objectIds }, userId },
    select: { objectId: true, isSelf: true, category: true },
  });

  for (const person of people) {
    const type = person.isSelf ? "You" : person.category || "Relationship";
    const stat = buildStat("Relationship", "status", { value: type }, context);
    if (stat) result[person.objectId] = [stat];
  }

  return result;
}

/**
 * FinanceItem has no Template either, but unlike Document/Goal/Person it has
 * no single fixed field set -- which fields even apply genuinely differs by
 * `kind` (see ADR-013's "Built-in Module preview configs" for why this one
 * gets its own decision instead of just copying the others). The edit form
 * already draws this same line: `category`/`rate` only render for
 * asset/liability, `frequency` only for income/expense. A liability's
 * `amount` is also labelled "Balance" there, not "Amount" -- carried onto
 * the card so it never disagrees with the item's own edit page.
 */
async function getFinanceItemPreviews(objectIds: string[], userId: string, context: PreviewFormatContext): Promise<Record<string, KinesisLinkPreviewStat[]>> {
  const result: Record<string, KinesisLinkPreviewStat[]> = {};

  const items = await prisma.financeItem.findMany({
    where: { objectId: { in: objectIds }, userId },
    select: { objectId: true, kind: true, amount: true, category: true, rate: true, frequency: true },
  });

  for (const item of items) {
    const isBalance = item.kind === "liability";
    const isRecurring = item.kind === "income" || item.kind === "expense";
    const amountStat = buildStat(isBalance ? "Balance" : "Amount", "currency", { value: String(item.amount) }, context);

    const stats = (isRecurring
      ? [amountStat, buildStat("Frequency", "status", { value: item.frequency ?? "" }, context)]
      : [amountStat, buildStat("Category", "status", { value: item.category ?? "" }, context), buildStat("Interest rate", "percent", { value: item.rate !== null ? String(item.rate) : "" }, context)]
    ).filter((stat): stat is KinesisLinkPreviewStat => stat !== null);

    if (stats.length) result[item.objectId] = stats;
  }

  return result;
}

/**
 * Rich preview data for a batch of linked objects (KD-042, ADR-013) -- read
 * live, batched by type, narrow (only the configured preview fields), rather
 * than one query per card. Each Object Type this function knows how to
 * preview gets its own builder above and its own query; an object of a type
 * with no builder here (To-Do) simply never gets an entry, and its card
 * falls back to the compact one -- that's not a special case, just an empty
 * result for a type nothing has taught this function to look up yet.
 *
 * An id in `objectIds` with no key in the returned record means "render the
 * compact card": no preview configured (or none possible for that type),
 * or every configured field came back empty -- KD-042 treats all three the
 * same way.
 *
 * A plain record rather than a Map, since every caller passes this straight
 * on as a prop into a Client Component (`KinesisLinkCard`'s consumers) --
 * always JSON-safe, unlike a Map.
 */
export async function getKinesisLinkPreviews(objectIds: string[]): Promise<Record<string, KinesisLinkPreviewStat[]>> {
  if (!objectIds.length) return {};

  const user = await requireKinesisUser();
  const [{ locale, currency }, today] = await Promise.all([getFormatPreferences(), getToday()]);
  const context: PreviewFormatContext = { locale, currency, today };

  const [customItems, documents, goals, people, financeItems] = await Promise.all([
    getCustomItemPreviews(objectIds, user.id, context),
    getDocumentPreviews(objectIds, user.id, context),
    getGoalPreviews(objectIds, user.id, context),
    getPersonPreviews(objectIds, user.id, context),
    getFinanceItemPreviews(objectIds, user.id, context),
  ]);

  return { ...customItems, ...documents, ...goals, ...people, ...financeItems };
}
