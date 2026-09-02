import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";

export type ActivityAction = "Added" | "Updated" | "Completed";

export type ActivityItem = {
  id: string;
  action: string;
  moduleName: string;
  objectName: string;
  icon: string;
  href: string | null;
  createdAt: Date;
};

export async function addActivity({ action, moduleName, objectName, icon, href }: Omit<ActivityItem, "id" | "createdAt">) {
  const user = await requireKinesisUser();
  return prisma.activityEvent.create({
    data: { id: crypto.randomUUID(), userId: user.id, action, moduleName, objectName, icon, href },
  });
}

export async function getRecentActivity(limit = 8) {
  const user = await requireKinesisUser();
  return prisma.activityEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function getActivityForHref(href: string, limit = 20) {
  const user = await requireKinesisUser();
  return prisma.activityEvent.findMany({ where: { userId: user.id, href }, orderBy: { createdAt: "desc" }, take: limit });
}
