import { prisma } from "@/lib/data/prisma";

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

export function addActivity({ action, moduleName, objectName, icon, href }: Omit<ActivityItem, "id" | "createdAt">) {
  return prisma.activityEvent.create({
    data: { id: crypto.randomUUID(), action, moduleName, objectName, icon, href },
  });
}

export function getRecentActivity(limit = 8) {
  return prisma.activityEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
