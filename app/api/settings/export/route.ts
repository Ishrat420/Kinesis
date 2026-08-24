import { prisma } from "@/lib/data/prisma";

export async function GET() {
  const [user, settings, documents, documentTypes, goals, goalUnits, people, relationships, financeItems, customModules, attentionDismissals] = await Promise.all([
    prisma.user.findMany(),
    prisma.userSettings.findMany(),
    prisma.document.findMany({ include: { customFields: true, notifications: true } }),
    prisma.documentType.findMany(),
    prisma.goal.findMany({ include: { milestones: true, metricHistory: true } }),
    prisma.goalUnit.findMany(),
    prisma.person.findMany({ include: { selfPractices: true, selfReflections: true, selfImportantDates: true } }),
    prisma.relationship.findMany({ include: { practices: true, reflections: true, importantDates: true, linkedGoals: true } }),
    prisma.financeItem.findMany(),
    prisma.customModule.findMany({ include: { items: { include: { fields: true } } } }),
    prisma.attentionDismissal.findMany(),
  ]);
  const exportedAt = new Date().toISOString();
  return new Response(JSON.stringify({ exportedAt, user, settings, documents, documentTypes, goals, goalUnits, people, relationships, financeItems, customModules, attentionDismissals }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="kinesis-export-${exportedAt.slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
