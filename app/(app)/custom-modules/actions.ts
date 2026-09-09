"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/data/prisma";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";
import { addActivity } from "@/lib/data/activity";
import { requireKinesisUser } from "@/lib/auth";
import { parseCustomFields, prepareCustomFields } from "@/lib/custom-fields/parse";
import { parseTemplateFieldValues } from "@/lib/templates/parse";
import { deleteObjects, objectFor } from "@/lib/data/objects";
import { promoteExtraFieldToTemplate } from "@/lib/data/custom-modules";
import { validateKinesisTargets } from "@/lib/data/kinesis-links";
import { refuse, refusalOf } from "@/lib/actions/refusal";
import { parseDateOnly } from "@/lib/dates";

const getValue = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const refresh = (moduleId: string) => { revalidatePath("/"); revalidatePath(`/custom-modules/${moduleId}`); };
export type CreateModuleState = { error?: string; field?: "name"; moduleId?: string };
export type CustomItemState = { error?: string; saved?: boolean };

/**
 * A due date is a day, not a moment, so it is stored at UTC midnight -- the
 * same convention `parseDateOnly` already gives every other due date in the
 * app (a To-Do's, in particular). This used to store noon instead, for no
 * documented reason predating that convention. Nothing that read it back ever
 * cared: every notification and Needs Attention candidate normalises to
 * midnight before comparing. The calendar was the one reader that took the
 * stored instant as given, so it read the leftover noon as a real time of day
 * and rendered every custom item as a 12:00 "Scheduled" event -- which also
 * meant unticking "Scheduled" in the calendar's filter hid every one of them.
 *
 * `parseDateOnly` also rejects a date that only looks valid (2026-02-30 was
 * previously accepted and silently rolled forward to March), which the regex
 * here never checked for.
 */
const dueDateValue = (raw: string) => {
  if (!raw) return null;
  return parseDateOnly(raw) ?? undefined;
};

export async function createCustomModuleAction(_: CreateModuleState, data: FormData): Promise<CreateModuleState> {
  const user = await requireKinesisUser();
  const name = getValue(data, "name");
  const icon = getValue(data, "icon");
  const color = getValue(data, "color");
  const templateId = getValue(data, "templateId") || null;
  if (!name) return { error: "Enter a module name.", field: "name" };
  if (name.length > 60) return { error: "Keep the module name under 60 characters.", field: "name" };
  if (!(icon in CUSTOM_MODULE_ICONS) || !/^#[0-9a-f]{6}$/i.test(color)) return { error: "Choose a valid icon and colour." };
  // Ownership rather than trust: a stray or someone else's template id in the
  // submitted form should fail closed, not silently create an unlinked module.
  if (templateId && !(await prisma.template.findFirst({ where: { id: templateId, userId: user.id }, select: { id: true } }))) {
    return { error: "Choose a template you own, or leave it blank." };
  }
  try {
    const customModule = await prisma.customModule.create({ data: { id: crypto.randomUUID(), userId: user.id, name, normalizedName: name.toLocaleLowerCase(), icon, color, description: getValue(data, "description") || null, templateId } });
    revalidatePath("/");
    return { moduleId: customModule.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "A module with this name already exists. Names must be unique.", field: "name" };
    throw error;
  }
}

export async function createCustomItemAction(moduleId: string, _previousState: CustomItemState, data: FormData): Promise<CustomItemState> {
  const user = await requireKinesisUser();
  const name = getValue(data, "name");
  if (!name) return { error: "Enter an item name." };
  if (name.length > 100) return { error: "Keep the item name under 100 characters." };
  const form = parseCustomFields(data);
  if (!form.ok) return { error: form.error };
  const templateValues = parseTemplateFieldValues(data);
  if (!templateValues.ok) return { error: templateValues.error };
  const ownedModule = await prisma.customModule.findFirst({ where: { id: moduleId, userId: user.id }, select: { id: true, templateId: true } });
  if (!ownedModule) return { error: "This module no longer exists." };

  // A due date is reachable only through a template's own Due Date field
  // (KD-040) -- there is no fixed input anymore for a module without one.
  const dueDateField = ownedModule.templateId
    ? await prisma.templateField.findFirst({ where: { templateId: ownedModule.templateId, isDueDate: true }, select: { id: true } })
    : null;
  const dueDate = dueDateField ? dueDateValue(templateValues.values.find((value) => value.templateFieldId === dueDateField.id)?.value ?? "") : null;
  if (dueDate === undefined) return { error: "Enter a valid due date." };

  const unowned = await validateKinesisTargets([...form.fields, ...templateValues.values]);
  if (unowned) return { error: unowned };
  await prisma.$transaction(async (tx) => {
    const created = await tx.customItem.create({ data: {
      id: crypto.randomUUID(), module: { connect: { id: moduleId } }, name, dueDate,
      // Whatever the module is currently linked to, permanently, per KD-035
      // Decision 7 -- later relinking the module never reaches back to this item.
      object: objectFor.customItem(name, user.id, prepareCustomFields(form.fields), ownedModule.templateId),
    } });
    if (ownedModule.templateId && templateValues.values.length) {
      await saveTemplateFieldValues(tx, created.objectId, ownedModule.templateId, templateValues.values, dueDateField?.id ?? null);
    }
  });
  const customModule = await prisma.customModule.findFirst({ where: { id: moduleId, userId: user.id }, select: { name: true, icon: true } });
  if (customModule) await addActivity({ action: "Added", moduleName: customModule.name, objectName: name, icon: `custom:${customModule.icon}`, href: `/custom-modules/${moduleId}` });
  refresh(moduleId);
  return {};
}

export async function updateCustomItemAction(moduleId: string, itemId: string, _previousState: CustomItemState, data: FormData): Promise<CustomItemState> {
  const user = await requireKinesisUser();
  const name = getValue(data, "name");
  if (!name) return { error: "Enter an item name." };
  if (name.length > 100) return { error: "Keep the item name under 100 characters." };
  const form = parseCustomFields(data);
  if (!form.ok) return { error: form.error };
  const templateValues = parseTemplateFieldValues(data);
  if (!templateValues.ok) return { error: templateValues.error };
  const unowned = await validateKinesisTargets([...form.fields, ...templateValues.values]);
  if (unowned) return { error: unowned };
  const fields = prepareCustomFields(form.fields);
  try {
    await prisma.$transaction(async (tx) => {
    const ownedItem = await tx.customItem.findFirst({
      where: { id: itemId, moduleId, module: { userId: user.id } },
      select: { objectId: true, object: { select: { templateId: true } } },
    });
    if (!ownedItem) refuse("This item no longer exists.");
    const templateId = ownedItem.object.templateId;

    // A due date is reachable only through a template's own Due Date field
    // (KD-040) -- an item whose template has none simply has no due date.
    const dueDateField = templateId ? await tx.templateField.findFirst({ where: { templateId, isDueDate: true }, select: { id: true } }) : null;
    let dueDate: Date | null = null;
    if (dueDateField) {
      const raw = templateValues.values.find((value) => value.templateFieldId === dueDateField.id)?.value ?? "";
      if (raw) {
        const parsed = parseDateOnly(raw);
        if (!parsed) refuse("Enter a valid due date.");
        dueDate = parsed;
      }
    }

    // Extras only -- a template field's type is changed from the template
    // it belongs to (Settings), never from here, and this object's own
    // save form never even offers to.
    const existingFields = await tx.objectField.findMany({ where: { objectId: ownedItem.objectId, templateFieldId: null }, select: { id: true, type: true } });
    const existingTypes = new Map(existingFields.map((field) => [field.id, field.type]));
    if (fields.some((field) => existingTypes.has(field.id) && existingTypes.get(field.id) !== field.type)) refuse("A custom field's type cannot be changed once it has been saved.");
    await tx.customItem.update({ where: { id: itemId, moduleId }, data: {
      name, dueDate, archived: data.get("archived") === "true",
    } });
    await tx.objectField.deleteMany({ where: { objectId: ownedItem.objectId, templateFieldId: null } });
    // A field's targets are a nested create -- createMany cannot carry those,
    // so each field (with its own links) is created on its own rather than in
    // one batched statement. The count here is always small.
    for (const field of fields) await tx.objectField.create({ data: { ...field, objectId: ownedItem.objectId } });

    if (templateId && templateValues.values.length) {
      await saveTemplateFieldValues(tx, ownedItem.objectId, templateId, templateValues.values, dueDateField?.id ?? null);
    }
    });
  } catch (failure) {
    // A refusal raised inside the transaction, which has now rolled back.
    // Anything else is a fault, or one of Next.js's control-flow errors, and
    // belongs to the boundary rather than to this form.
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  const customModule = await prisma.customModule.findFirst({ where: { id: moduleId, userId: user.id }, select: { name: true, icon: true } });
  if (customModule) await addActivity({ action: "Updated", moduleName: customModule.name, objectName: name, icon: `custom:${customModule.icon}`, href: `/custom-modules/${moduleId}` });
  refresh(moduleId);
  revalidatePath(`/custom-modules/${moduleId}/items/${itemId}`);
  return { saved: true };
}

/**
 * Writes an object's values for the template fields it's rendering (KD-035
 * Phase 3). A value row's `templateFieldId` is what makes it one -- unlike
 * extras, these are never deleted-and-recreated wholesale: a field with
 * nothing entered has no row at all (Phase 2's "row only exists once a
 * value is saved"), so a value that's gone blank again gets its row
 * deleted rather than kept around empty, and everything else is a plain
 * upsert keyed on the template field it belongs to.
 *
 * The Due Date field (KD-038) never reaches this function's writes at all
 * -- its value has already been written to `CustomItem.dueDate` by the
 * caller, so `dueDateFieldId` is skipped here rather than also getting an
 * (unused) `ObjectField` row.
 */
async function saveTemplateFieldValues(
  tx: Prisma.TransactionClient,
  objectId: string,
  templateId: string,
  values: { templateFieldId: string; value: string; targetObjectIds: string[] }[],
  dueDateFieldId: string | null,
) {
  const templateFieldTypes = new Map((await tx.templateField.findMany({ where: { templateId }, select: { id: true, type: true } })).map((field) => [field.id, field.type]));
  for (const submitted of values) {
    if (submitted.templateFieldId === dueDateFieldId) continue;
    // Ignore a field id that isn't actually part of this item's template --
    // stale, or never legitimate. Nothing to write either way.
    const type = templateFieldTypes.get(submitted.templateFieldId);
    if (!type) continue;

    const existing = await tx.objectField.findFirst({ where: { objectId, templateFieldId: submitted.templateFieldId } });
    const isEmpty = !submitted.value && !submitted.targetObjectIds.length;

    if (isEmpty) {
      if (existing) await tx.objectField.delete({ where: { id: existing.id } });
      continue;
    }

    const links = { deleteMany: {}, create: submitted.targetObjectIds.map((targetObjectId, position) => ({ id: crypto.randomUUID(), targetObjectId, position })) };
    if (existing) {
      await tx.objectField.update({ where: { id: existing.id }, data: { value: submitted.value, links } });
    } else {
      await tx.objectField.create({ data: { id: crypto.randomUUID(), objectId, templateFieldId: submitted.templateFieldId, label: "", type, value: submitted.value, position: 0, links } });
    }
  }
}

export async function promoteFieldToTemplateAction(moduleId: string, itemId: string, fieldId: string): Promise<CustomItemState> {
  try {
    await promoteExtraFieldToTemplate(moduleId, itemId, fieldId);
  } catch (failure) {
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  refresh(moduleId);
  revalidatePath(`/custom-modules/${moduleId}/items/${itemId}`);
  return { saved: true };
}

export async function toggleCustomItemArchivedAction(moduleId: string, itemId: string, archived: boolean) {
  const user = await requireKinesisUser();
  await prisma.customItem.updateMany({ where: { id: itemId, moduleId, module: { userId: user.id } }, data: { archived } });
  refresh(moduleId);
}

/**
 * Deleting an item reports a refusal instead of redirecting regardless.
 *
 * The redirect stays outside anything that could catch it: `redirect` works by
 * throwing a control-flow error, so running it inside a `try` would turn a
 * successful delete into a swallowed exception.
 */
export async function deleteCustomItemAction(moduleId: string, itemId: string): Promise<CustomItemState> {
  const user = await requireKinesisUser();
  const item = await prisma.customItem.findFirst({ where: { id: itemId, moduleId, module: { userId: user.id } }, select: { objectId: true } });
  if (!item) return { error: "This item no longer exists." };
  await deleteObjects(prisma, [item.objectId], user.id);
  refresh(moduleId);
  redirect(`/custom-modules/${moduleId}`);
}

export async function deleteCustomModuleAction(moduleId: string) {
  const user = await requireKinesisUser();
  await prisma.$transaction(async (tx) => {
    const customModule = await tx.customModule.findFirst({ where: { id: moduleId, userId: user.id }, select: { items: { select: { objectId: true } } } });
    if (!customModule) return;
    await deleteObjects(tx, customModule.items.map(({ objectId }) => objectId), user.id);
    await tx.customModule.delete({ where: { id: moduleId } });
  });
  revalidatePath("/");
  redirect("/");
}
