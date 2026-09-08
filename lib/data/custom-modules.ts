import type { ObjectField } from "@prisma/client";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";

/** A custom item's own fields, off the shared `ObjectField` table, in display order. */
const itemFieldsInclude = { object: { select: { fields: { orderBy: { position: "asc" as const } } } } };

/** Presents an item the way every caller of this file already expects: `fields` as its own flat array. */
function withFields<T extends { object: { fields: ObjectField[] } }>({ object, ...item }: T) {
  return { ...item, fields: object.fields };
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

export async function getCustomItem(moduleId: string, itemId: string) {
  const user = await requireKinesisUser();
  const item = await prisma.customItem.findFirst({
    where: { id: itemId, moduleId, module: { userId: user.id } },
    include: { module: true, ...itemFieldsInclude },
  });
  return item && withFields(item);
}
