"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/data/prisma";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";
import { addActivity } from "@/lib/data/activity";

const getValue = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const refresh = (moduleId: string) => { revalidatePath("/"); revalidatePath(`/custom-modules/${moduleId}`); };
export type CreateModuleState = { error?: string; field?: "name"; moduleId?: string };

export async function createCustomModuleAction(_: CreateModuleState, data: FormData): Promise<CreateModuleState> {
  const name = getValue(data, "name");
  const icon = getValue(data, "icon");
  const color = getValue(data, "color");
  if (!name) return { error: "Enter a module name.", field: "name" };
  if (name.length > 60) return { error: "Keep the module name under 60 characters.", field: "name" };
  if (!(icon in CUSTOM_MODULE_ICONS) || !/^#[0-9a-f]{6}$/i.test(color)) return { error: "Choose a valid icon and colour." };
  try {
    const customModule = await prisma.customModule.create({ data: { id: crypto.randomUUID(), name, normalizedName: name.toLocaleLowerCase(), icon, color, description: getValue(data, "description") || null } });
    revalidatePath("/");
    return { moduleId: customModule.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "A module with this name already exists. Names must be unique.", field: "name" };
    throw error;
  }
}

export async function createCustomItemAction(moduleId: string, data: FormData) {
  const name = getValue(data, "name");
  if (!name) return;
  const labels = data.getAll("fieldLabel").map(String);
  const values = data.getAll("fieldValue").map(String);
  const reminder = getValue(data, "reminder");
  await prisma.customItem.create({ data: {
    id: crypto.randomUUID(), moduleId, name, notes: getValue(data, "notes") || null,
    reminder: reminder ? new Date(`${reminder}T12:00:00.000Z`) : null, link: getValue(data, "link") || null,
    fields: { create: labels.map((label, position) => ({ id: crypto.randomUUID(), label: label.trim(), value: (values[position] ?? "").trim(), position })).filter((field) => field.label) },
  } });
  const customModule = await prisma.customModule.findUnique({ where: { id: moduleId }, select: { name: true, icon: true } });
  if (customModule) await addActivity({ action: "Added", moduleName: customModule.name, objectName: name, icon: `custom:${customModule.icon}`, href: `/custom-modules/${moduleId}` });
  refresh(moduleId);
}

export async function updateCustomItemAction(moduleId: string, itemId: string, data: FormData) {
  const name = getValue(data, "name");
  if (!name) return;
  const labels = data.getAll("fieldLabel").map(String);
  const values = data.getAll("fieldValue").map(String);
  const reminder = getValue(data, "reminder");
  const fields = labels.map((label, position) => ({ id: crypto.randomUUID(), label: label.trim(), value: (values[position] ?? "").trim(), position })).filter((field) => field.label);
  await prisma.$transaction(async (tx) => {
    await tx.customItem.update({ where: { id: itemId, moduleId }, data: {
      name, notes: getValue(data, "notes") || null,
      reminder: reminder ? new Date(`${reminder}T12:00:00.000Z`) : null,
      link: getValue(data, "link") || null, archived: data.get("archived") === "true",
    } });
    await tx.customItemField.deleteMany({ where: { itemId } });
    if (fields.length) await tx.customItemField.createMany({ data: fields.map((field) => ({ ...field, itemId })) });
  });
  const customModule = await prisma.customModule.findUnique({ where: { id: moduleId }, select: { name: true, icon: true } });
  if (customModule) await addActivity({ action: "Updated", moduleName: customModule.name, objectName: name, icon: `custom:${customModule.icon}`, href: `/custom-modules/${moduleId}` });
  refresh(moduleId);
  revalidatePath(`/custom-modules/${moduleId}/items/${itemId}`);
}

export async function toggleCustomItemArchivedAction(moduleId: string, itemId: string, archived: boolean) {
  await prisma.customItem.updateMany({ where: { id: itemId, moduleId }, data: { archived } });
  refresh(moduleId);
}

export async function deleteCustomItemAction(moduleId: string, itemId: string) {
  await prisma.customItem.deleteMany({ where: { id: itemId, moduleId } });
  refresh(moduleId);
  redirect(`/custom-modules/${moduleId}`);
}

export async function deleteCustomModuleAction(moduleId: string) {
  await prisma.customModule.delete({ where: { id: moduleId } });
  revalidatePath("/");
  redirect("/");
}
