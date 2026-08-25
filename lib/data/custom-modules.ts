import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";

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
  return prisma.customModule.findFirst({
    where: { id, userId: user.id },
    include: { items: { include: { fields: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "desc" } } },
  });
}

export async function getCustomItem(moduleId: string, itemId: string) {
  const user = await requireKinesisUser();
  return prisma.customItem.findFirst({
    where: { id: itemId, moduleId, module: { userId: user.id } },
    include: { module: true, fields: { orderBy: { position: "asc" } } },
  });
}
