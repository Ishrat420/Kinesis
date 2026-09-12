import type { FieldLink, ObjectField } from "@prisma/client";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { refuse } from "@/lib/actions/refusal";
import { presentCustomFields } from "@/lib/custom-fields/present";
import type { TemplateFieldValue } from "@/components/custom-fields/TemplateFieldValues";

/** A custom item's own fields, off the shared `ObjectField` table, in display order, with each field's Kinesis Link targets in the order they were added. */
const itemFieldsInclude = {
  object: { select: { fields: { orderBy: { position: "asc" as const }, include: { links: { orderBy: { position: "asc" as const } } } } } },
};

/** Presents an item the way every caller of this file already expects: `fields` as its own flat array. */
function withFields<T extends { object: { fields: (ObjectField & { links: FieldLink[] })[] } }>({ object, ...item }: T) {
  return { ...item, fields: presentCustomFields(object.fields) };
}

export async function getCustomModules() {
  const user = await requireKinesisUser();
  return prisma.customModule.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
}

export async function getCustomModulesWithItemCount() {
  const user = await requireKinesisUser();
  return prisma.customModule.findMany({
    where: { userId: user.id },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCustomModule(id: string) {
  const user = await requireKinesisUser();
  const customModule = await prisma.customModule.findFirst({
    where: { id, userId: user.id },
    include: { items: { include: itemFieldsInclude, orderBy: { createdAt: "desc" } } },
  });
  if (!customModule) return null;
  return { ...customModule, items: customModule.items.map(withFields) };
}

/**
 * An object's values for the template it follows (KD-035 Phase 3), merged
 * with the template's *current* field list -- live, every time this is
 * called, per Decision 7. A template field nobody has filled in yet simply
 * has no matching row, and renders empty rather than being backfilled.
 *
 * The Due Date field (KD-038) is the one exception to "a value lives in
 * ObjectField": it has no row there at all, ever -- its value is
 * `itemDueDate`, the object's own `CustomItem.dueDate`, the same column the
 * old fixed Due Date input reads and writes.
 */
async function getTemplateFieldValues(objectId: string, templateId: string, itemDueDate: Date | null): Promise<TemplateFieldValue[]> {
  const [templateFields, values] = await Promise.all([
    prisma.templateField.findMany({ where: { templateId }, orderBy: { position: "asc" } }),
    prisma.objectField.findMany({ where: { objectId, templateFieldId: { not: null } }, include: { links: { orderBy: { position: "asc" } } } }),
  ]);
  const valueByField = new Map(values.map((value) => [value.templateFieldId as string, value]));
  return templateFields.map((field) => {
    if (field.isDueDate) {
      return {
        templateFieldId: field.id,
        label: field.label,
        type: field.type,
        isDueDate: true,
        multiline: field.multiline,
        numberFormat: field.numberFormat ?? undefined,
        value: itemDueDate ? itemDueDate.toISOString().slice(0, 10) : "",
        targetObjectIds: [],
      };
    }
    const value = valueByField.get(field.id);
    return {
      templateFieldId: field.id,
      label: field.label,
      type: field.type,
      isDueDate: false,
      multiline: field.multiline,
      numberFormat: field.numberFormat ?? undefined,
      value: value?.value ?? "",
      targetObjectIds: value ? value.links.map((link) => link.targetObjectId) : [],
    };
  });
}

export async function getCustomItem(moduleId: string, itemId: string) {
  const user = await requireKinesisUser();
  const item = await prisma.customItem.findFirst({
    where: { id: itemId, moduleId, module: { userId: user.id } },
    include: {
      module: true,
      object: {
        select: {
          templateId: true,
          // Extras only -- a row that is a value for a template field is
          // presented separately below, in the template's own order, not
          // mixed in with this object's ad-hoc fields.
          fields: { where: { templateFieldId: null }, orderBy: { position: "asc" }, include: { links: { orderBy: { position: "asc" } } } },
        },
      },
    },
  });
  if (!item) return null;
  const { object, ...rest } = item;
  const templateFields = object.templateId ? await getTemplateFieldValues(item.objectId, object.templateId, item.dueDate) : [];
  return { ...rest, templateId: object.templateId, templateFields, fields: presentCustomFields(object.fields) };
}

/**
 * Turns one of an object's own ad-hoc fields into a real field on the
 * template it follows (KD-035 Decision 4) -- the object's existing value is
 * kept exactly where it is, and every other object under the template
 * immediately gains the new field, empty, the ordinary "add a field" case
 * from Decision 1.
 */
export async function promoteExtraFieldToTemplate(moduleId: string, itemId: string, fieldId: string) {
  const user = await requireKinesisUser();
  return prisma.$transaction(async (tx) => {
    const item = await tx.customItem.findFirst({
      where: { id: itemId, moduleId, module: { userId: user.id } },
      select: { objectId: true, object: { select: { templateId: true } } },
    });
    if (!item) refuse("This item no longer exists.");
    const templateId = item.object.templateId;
    if (!templateId) refuse("This item doesn't follow a template.");

    const field = await tx.objectField.findFirst({ where: { id: fieldId, objectId: item.objectId, templateFieldId: null } });
    if (!field) refuse("This field no longer exists.");

    const last = await tx.templateField.findFirst({ where: { templateId }, orderBy: { position: "desc" }, select: { position: true } });
    const templateField = await tx.templateField.create({
      data: { id: crypto.randomUUID(), templateId, label: field.label, type: field.type, position: (last?.position ?? -1) + 1 },
    });
    await tx.objectField.update({ where: { id: field.id }, data: { templateFieldId: templateField.id } });
  });
}
