import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "./prisma";
import { KINESIS_LINK_TARGET_TYPES, kinesisLinkTargetOrder, type KinesisLinkOption } from "@/lib/custom-fields/types";

/**
 * A link stores an object id and nothing else. The module a target belongs to
 * still decides how it is presented and where it opens, so that mapping lives
 * here rather than in the column.
 */
export async function getKinesisLinkOptions(): Promise<KinesisLinkOption[]> {
  const user = await requireKinesisUser();
  const objects = await prisma.object.findMany({
    where: { userId: user.id, type: { in: [...KINESIS_LINK_TARGET_TYPES] } },
    select: {
      id: true, type: true, name: true,
      customItem: { select: { id: true, module: { select: { id: true, name: true, icon: true, color: true } } } },
      document: { select: { id: true } },
      goal: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });
  const options = objects.flatMap(({ id, type, name, document, goal, customItem }): KinesisLinkOption[] => {
    if (type === "DOCUMENT" && document) return [{ type, objectId: id, module: "Documents", name, href: `/documents/${document.id}`, color: "#2563eb" }];
    if (type === "GOAL" && goal) return [{ type, objectId: id, module: "Goals", name, href: `/goals/${goal.id}`, color: "#7c3aed" }];
    if (type === "CUSTOM_ITEM" && customItem) {
      const { module } = customItem;
      return [{ type, objectId: id, module: module.name, name, href: `/custom-modules/${module.id}/items/${customItem.id}`, icon: module.icon, color: module.color }];
    }
    return [];
  });
  // Documents, then custom items, then goals, each already by name: the order the
  // picker has always grouped its modules in, read from each type's own `order`.
  return options.sort((first, second) => kinesisLinkTargetOrder(first.type) - kinesisLinkTargetOrder(second.type));
}

/** The foreign key keeps links pointing at something real; this keeps them pointing at something of yours. */
export async function validateKinesisTargets(targets: Array<{ targetObjectId?: string | null }>) {
  const user = await requireKinesisUser();
  const targetIds = [...new Set(targets.flatMap(({ targetObjectId }) => (targetObjectId ? [targetObjectId] : [])))];
  if (!targetIds.length) return;
  const owned = await prisma.object.count({
    where: { id: { in: targetIds }, userId: user.id, type: { in: [...KINESIS_LINK_TARGET_TYPES] } },
  });
  if (owned !== targetIds.length) throw new Error("Linked object not found");
}
