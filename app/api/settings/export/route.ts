import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser, requireRecentVerificationResponse } from "@/lib/auth";

export async function GET() {
  const verification = await requireRecentVerificationResponse();
  if (verification !== true) return verification;
  const kinesisUser = await requireKinesisUser();
  const userId = kinesisUser.id;
  const [user, settings, documents, documentTypes, goals, goalUnits, people, relationships, financeItems, customModules, attentionDismissals] = await Promise.all([
    prisma.user.findMany({ where: { id: userId }, omit: { clerkUserId: true } }),
    prisma.userSettings.findMany({ where: { userId } }),
    prisma.document.findMany({ where: { userId }, include: { customFields: true, notifications: true } }),
    prisma.documentType.findMany({ where: { userId } }),
    prisma.goal.findMany({ where: { userId }, include: { milestones: true, metricHistory: true } }),
    prisma.goalUnit.findMany({ where: { userId } }),
    prisma.person.findMany({ where: { userId }, include: { selfPractices: true, selfReflections: true, selfImportantDates: true } }),
    prisma.relationship.findMany({ where: { userId }, include: { practices: true, reflections: true, importantDates: true, linkedGoals: true } }),
    prisma.financeItem.findMany({ where: { userId } }),
    prisma.customModule.findMany({ where: { userId }, include: { items: { include: { fields: true } } } }),
    prisma.attentionDismissal.findMany({ where: { userId } }),
  ]);
  await prisma.securityEvent.create({ data: { event: "DATA_EXPORT_COMPLETED", userId } });
  const exportedAt = new Date().toISOString();
  return new Response(JSON.stringify({ exportedAt, user, settings, documents, documentTypes, goals, goalUnits, people, relationships, financeItems, customModules, attentionDismissals }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="kinesis-export-${exportedAt.slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
