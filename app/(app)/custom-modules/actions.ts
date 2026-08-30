"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/data/prisma";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";
import { addActivity } from "@/lib/data/activity";
import { requireKinesisUser } from "@/lib/auth";
import { CUSTOM_FIELD_TYPES, parseKinesisTarget, type CustomFieldType } from "@/lib/custom-fields/types";
import { validateKinesisTargets } from "@/lib/data/kinesis-links";

const getValue = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const refresh = (moduleId: string) => { revalidatePath("/"); revalidatePath(`/custom-modules/${moduleId}`); };
export type CreateModuleState = { error?: string; field?: "name"; moduleId?: string };
export type CustomItemState = { error?: string };

const reminderDate = (raw: string) => {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

function customFields(data: FormData) {
  const ids = data.getAll("fieldId").map(String);
  const labels = data.getAll("fieldLabel").map(String);
  const values = data.getAll("fieldValue").map(String);
  const types = data.getAll("fieldType").map(String);
  const targets = data.getAll("fieldTarget").map(String);
  const validTypes = new Set(CUSTOM_FIELD_TYPES.map(({ value }) => value));
  return labels.map((label, position) => {
    const requested = types[position] as CustomFieldType;
    const type = validTypes.has(requested) ? requested : "TEXT";
    const target = type === "KINESIS_LINK" ? parseKinesisTarget(targets[position] ?? "") : null;
    if (type === "KINESIS_LINK" && !target) throw new Error("Select an object for every Kinesis Link field");
    return { id: ids[position] || crypto.randomUUID(), label: label.trim(), value: type === "KINESIS_LINK" ? "" : (values[position] ?? "").trim(), type, targetType: target?.targetType ?? null, targetId: target?.targetId ?? null, position };
  }).filter((field) => field.label);
}

export async function createCustomModuleAction(_: CreateModuleState, data: FormData): Promise<CreateModuleState> {
  const user = await requireKinesisUser();
  const name = getValue(data, "name");
  const icon = getValue(data, "icon");
  const color = getValue(data, "color");
  if (!name) return { error: "Enter a module name.", field: "name" };
  if (name.length > 60) return { error: "Keep the module name under 60 characters.", field: "name" };
  if (!(icon in CUSTOM_MODULE_ICONS) || !/^#[0-9a-f]{6}$/i.test(color)) return { error: "Choose a valid icon and colour." };
  try {
    const customModule = await prisma.customModule.create({ data: { id: crypto.randomUUID(), userId: user.id, name, normalizedName: name.toLocaleLowerCase(), icon, color, description: getValue(data, "description") || null } });
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
  const reminder = reminderDate(getValue(data, "reminder"));
  if (reminder === undefined) return { error: "Enter a valid reminder date." };
  const fields = customFields(data);
  const ownedModule = await prisma.customModule.findFirst({ where: { id: moduleId, userId: user.id }, select: { id: true } });
  if (!ownedModule) throw new Error("Module not found");
  await validateKinesisTargets(fields);
  await prisma.customItem.create({ data: {
    id: crypto.randomUUID(), moduleId, name, notes: getValue(data, "notes") || null,
    reminder, link: getValue(data, "link") || null,
    fields: { create: fields },
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
  const reminder = reminderDate(getValue(data, "reminder"));
  if (reminder === undefined) return { error: "Enter a valid reminder date." };
  const fields = customFields(data);
  await validateKinesisTargets(fields);
  await prisma.$transaction(async (tx) => {
    const ownedItem = await tx.customItem.findFirst({ where: { id: itemId, moduleId, module: { userId: user.id } }, select: { id: true } });
    if (!ownedItem) throw new Error("Item not found");
    const existingFields = await tx.customItemField.findMany({ where: { itemId }, select: { id: true, type: true } });
    const existingTypes = new Map(existingFields.map((field) => [field.id, field.type]));
    if (fields.some((field) => existingTypes.has(field.id) && existingTypes.get(field.id) !== field.type)) throw new Error("A custom field's type cannot be changed");
    await tx.customItem.update({ where: { id: itemId, moduleId }, data: {
      name, notes: getValue(data, "notes") || null, reminder,
      link: getValue(data, "link") || null, archived: data.get("archived") === "true",
    } });
    await tx.customItemField.deleteMany({ where: { itemId } });
    if (fields.length) await tx.customItemField.createMany({ data: fields.map((field) => ({ ...field, itemId })) });
  });
  const customModule = await prisma.customModule.findFirst({ where: { id: moduleId, userId: user.id }, select: { name: true, icon: true } });
  if (customModule) await addActivity({ action: "Updated", moduleName: customModule.name, objectName: name, icon: `custom:${customModule.icon}`, href: `/custom-modules/${moduleId}` });
  refresh(moduleId);
  revalidatePath(`/custom-modules/${moduleId}/items/${itemId}`);
  return {};
}

export async function toggleCustomItemArchivedAction(moduleId: string, itemId: string, archived: boolean) {
  const user = await requireKinesisUser();
  await prisma.customItem.updateMany({ where: { id: itemId, moduleId, module: { userId: user.id } }, data: { archived } });
  refresh(moduleId);
}

export async function deleteCustomItemAction(moduleId: string, itemId: string) {
  const user = await requireKinesisUser();
  await prisma.customItem.deleteMany({ where: { id: itemId, moduleId, module: { userId: user.id } } });
  refresh(moduleId);
  redirect(`/custom-modules/${moduleId}`);
}

export async function deleteCustomModuleAction(moduleId: string) {
  const user = await requireKinesisUser();
  await prisma.customModule.deleteMany({ where: { id: moduleId, userId: user.id } });
  revalidatePath("/");
  redirect("/");
}
