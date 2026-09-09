"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/data/prisma";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";
import { addActivity } from "@/lib/data/activity";
import { requireKinesisUser } from "@/lib/auth";
import { parseCustomFields, prepareCustomFields } from "@/lib/custom-fields/parse";
import { deleteObjects, objectFor } from "@/lib/data/objects";
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
  const dueDate = dueDateValue(getValue(data, "dueDate"));
  if (dueDate === undefined) return { error: "Enter a valid due date." };
  const form = parseCustomFields(data);
  if (!form.ok) return { error: form.error };
  const ownedModule = await prisma.customModule.findFirst({ where: { id: moduleId, userId: user.id }, select: { id: true, templateId: true } });
  if (!ownedModule) return { error: "This module no longer exists." };
  const unowned = await validateKinesisTargets(form.fields);
  if (unowned) return { error: unowned };
  await prisma.customItem.create({ data: {
    id: crypto.randomUUID(), module: { connect: { id: moduleId } }, name, notes: getValue(data, "notes") || null,
    dueDate, link: getValue(data, "link") || null,
    // Whatever the module is currently linked to, permanently, per KD-035
    // Decision 7 -- later relinking the module never reaches back to this item.
    object: objectFor.customItem(name, user.id, prepareCustomFields(form.fields), ownedModule.templateId),
  } });
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
  const dueDate = dueDateValue(getValue(data, "dueDate"));
  if (dueDate === undefined) return { error: "Enter a valid due date." };
  const form = parseCustomFields(data);
  if (!form.ok) return { error: form.error };
  const unowned = await validateKinesisTargets(form.fields);
  if (unowned) return { error: unowned };
  const fields = prepareCustomFields(form.fields);
  try {
    await prisma.$transaction(async (tx) => {
    const ownedItem = await tx.customItem.findFirst({ where: { id: itemId, moduleId, module: { userId: user.id } }, select: { objectId: true } });
    if (!ownedItem) refuse("This item no longer exists.");
    const existingFields = await tx.objectField.findMany({ where: { objectId: ownedItem.objectId }, select: { id: true, type: true } });
    const existingTypes = new Map(existingFields.map((field) => [field.id, field.type]));
    if (fields.some((field) => existingTypes.has(field.id) && existingTypes.get(field.id) !== field.type)) refuse("A custom field's type cannot be changed once it has been saved.");
    await tx.customItem.update({ where: { id: itemId, moduleId }, data: {
      name, notes: getValue(data, "notes") || null, dueDate,
      link: getValue(data, "link") || null, archived: data.get("archived") === "true",
    } });
    await tx.objectField.deleteMany({ where: { objectId: ownedItem.objectId } });
    // A field's targets are a nested create -- createMany cannot carry those,
    // so each field (with its own links) is created on its own rather than in
    // one batched statement. The count here is always small.
    for (const field of fields) await tx.objectField.create({ data: { ...field, objectId: ownedItem.objectId } });
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
