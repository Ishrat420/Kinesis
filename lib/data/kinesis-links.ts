import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "./prisma";
import type { KinesisLinkOption, KinesisObjectType } from "@/lib/custom-fields/types";

export async function getKinesisLinkOptions(): Promise<KinesisLinkOption[]> {
  const user = await requireKinesisUser();
  const [documents, items] = await Promise.all([
    prisma.document.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.customItem.findMany({ where: { module: { userId: user.id } }, select: { id: true, name: true, module: { select: { id: true, name: true } } }, orderBy: { name: "asc" } }),
  ]);
  return [
    ...documents.map(({ id, name }) => ({ type: "DOCUMENT" as const, id, module: "Documents", name, href: `/documents/${id}` })),
    ...items.map(({ id, name, module }) => ({ type: "CUSTOM_ITEM" as const, id, module: module.name, name, href: `/custom-modules/${module.id}/items/${id}` })),
  ];
}

export async function validateKinesisTargets(targets: Array<{ targetType?: KinesisObjectType | null; targetId?: string | null }>) {
  const user = await requireKinesisUser();
  const documentIds = targets.filter((target) => target.targetType === "DOCUMENT" && target.targetId).map((target) => target.targetId!);
  const itemIds = targets.filter((target) => target.targetType === "CUSTOM_ITEM" && target.targetId).map((target) => target.targetId!);
  const [documents, items] = await Promise.all([
    prisma.document.findMany({ where: { id: { in: documentIds }, userId: user.id }, select: { id: true } }),
    prisma.customItem.findMany({ where: { id: { in: itemIds }, module: { userId: user.id } }, select: { id: true } }),
  ]);
  const allowed = new Set([...documents.map(({ id }) => `DOCUMENT:${id}`), ...items.map(({ id }) => `CUSTOM_ITEM:${id}`)]);
  if (targets.some(({ targetType, targetId }) => targetType && targetId && !allowed.has(`${targetType}:${targetId}`))) throw new Error("Linked object not found");
}
