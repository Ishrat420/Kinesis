import { prisma } from "./prisma";

export function getCustomModules() {
  return prisma.customModule.findMany({ orderBy: { createdAt: "asc" } });
}

export function getCustomModule(id: string) {
  return prisma.customModule.findUnique({
    where: { id },
    include: { items: { include: { fields: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "desc" } } },
  });
}

export function getCustomItem(moduleId: string, itemId: string) {
  return prisma.customItem.findFirst({
    where: { id: itemId, moduleId },
    include: { module: true, fields: { orderBy: { position: "asc" } } },
  });
}
