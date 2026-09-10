import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";

/**
 * Shared by every "sweeps the whole account" test (delete-all-data, the data
 * export) so the two can't quietly drift apart from each other, or from the
 * schema, the way delete-all-data and export both once did independently --
 * each missing Template/TemplateField, export also missing FieldLink,
 * ActivityEvent and NotificationRead, for the same underlying reason: no
 * shared source of truth for "everything a user can own." One seed, read by
 * both tests, closes that gap for both at once and keeps it closed.
 */

/**
 * Tables that hold no per-user data at all, so an account-level sweep has
 * nothing to seed or delete in them -- currently just CspViolationReport,
 * which records browser CSP reports with no userId (see
 * lib/security/csp-reports.ts) and can arrive from an unauthenticated page.
 */
const NON_USER_TABLES = ["CspViolationReport"];

export async function tableCounts(): Promise<Record<string, number>> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
      AND tablename NOT IN (${Prisma.join(NON_USER_TABLES)})
    ORDER BY tablename
  `;
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [row] = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${tablename}"`,
    );
    counts[tablename] = row.count;
  }
  return counts;
}

/** Populates every table a user can own, so nothing is missed by omission. */
export async function seedEverything(userId: string, tag: string) {
  const object = (suffix: string, type: "DOCUMENT" | "GOAL" | "FINANCE_ITEM" | "PERSON" | "CUSTOM_ITEM" | "TODO", name: string, fields?: { id: string; label: string; value: string }[]) =>
    prisma.object.create({ data: { id: `${tag}-object-${suffix}`, type, name, userId, ...(fields ? { fields: { create: fields } } : {}) } });

  await prisma.userSettings.create({ data: { userId } });
  await prisma.documentType.create({ data: { id: `${tag}-doctype`, name: "Passport", userId } });
  await prisma.goalUnit.create({ data: { id: `${tag}-unit`, name: "kg", userId } });
  await prisma.attentionDismissal.create({ data: { id: `${tag}-dismissal`, itemKey: "k", userId } });
  await prisma.activityEvent.create({
    data: { id: `${tag}-activity`, action: "Added", moduleName: "Goals", objectName: "x", icon: "goals", userId },
  });
  await prisma.securityEvent.create({ data: { id: `${tag}-security`, event: "SIGNED_IN", userId } });

  await object("doc", "DOCUMENT", "Doc", [{ id: `${tag}-docfield`, label: "L", value: "V" }]);
  await prisma.document.create({
    data: {
      id: `${tag}-doc`, name: "Doc", type: "Passport", status: "Active", owner: "Owner", userId,
      objectId: `${tag}-object-doc`,
    },
  });

  await object("goal", "GOAL", "Goal one");
  await prisma.goal.create({
    data: {
      id: `${tag}-goal`, name: "Goal one", userId, objectId: `${tag}-object-goal`,
      milestones: { create: { id: `${tag}-milestone`, name: "M" } },
      metricHistory: { create: { id: `${tag}-snapshot`, value: 1 } },
    },
  });
  await object("goal2", "GOAL", "Goal two");
  await prisma.goal.create({ data: { id: `${tag}-goal2`, name: "Goal two", userId, objectId: `${tag}-object-goal2` } });
  await prisma.objectRelationship.create({
    data: {
      id: `${tag}-objrel`, userId, type: "SUPPORTS",
      sourceObjectId: `${tag}-object-goal`, targetObjectId: `${tag}-object-goal2`,
      pairKey: `${tag}-object-goal:${tag}-object-goal2`,
    },
  });

  // One read marker hanging off a document, one owned only by the user -- the
  // second is what an account-level sweep has to catch, since no record's
  // cascade will ever reach it.
  await prisma.notificationRead.createMany({
    data: [
      { id: `${tag}-notif-doc`, itemKey: `document:${tag}-doc:EXPIRED:2030-01-01`, documentId: `${tag}-doc`, userId },
      { id: `${tag}-notif-bare`, itemKey: `document:${tag}-gone:EXPIRED:2030-01-01`, userId },
    ],
  });

  await object("finance", "FINANCE_ITEM", "Salary");
  await prisma.financeItem.create({
    data: { id: `${tag}-finance`, kind: "asset", name: "Salary", amount: 1, userId, objectId: `${tag}-object-finance` },
  });

  await object("person", "PERSON", "Me");
  await prisma.person.create({
    data: {
      id: `${tag}-person`, name: "Me", isSelf: true, userId, objectId: `${tag}-object-person`,
      selfPractices: { create: { id: `${tag}-selfpractice`, title: "Walk" } },
      selfReflections: { create: { id: `${tag}-selfreflection`, text: "t", reflectedAt: new Date() } },
      selfImportantDates: { create: { id: `${tag}-selfdate`, label: "Birthday", date: new Date() } },
    },
  });
  await object("person2", "PERSON", "Them");
  await prisma.person.create({ data: { id: `${tag}-person2`, name: "Them", userId, objectId: `${tag}-object-person2` } });
  await prisma.relationship.create({
    data: {
      id: `${tag}-relationship`, userId, firstPersonId: `${tag}-person`, secondPersonId: `${tag}-person2`,
      practices: { create: { id: `${tag}-practice`, title: "Call" } },
      reflections: { create: { id: `${tag}-reflection`, text: "t", reflectedAt: new Date() } },
      importantDates: { create: { id: `${tag}-date`, label: "Anniversary", date: new Date() } },
      linkedGoals: { create: { goalId: `${tag}-goal` } },
    },
  });

  // A template, one of its fields, and an object that follows it -- Object.templateId
  // is onDelete: Restrict, so this also exercises the ordering delete-all depends on
  // (Object rows must be gone before Template can be). The KINESIS_LINK field's value
  // is a FieldLink to the goal object, closing that table's coverage too.
  await prisma.template.create({
    data: {
      id: `${tag}-template`, userId, name: "Reading log",
      fields: { create: [
        { id: `${tag}-templatefield`, label: "Author", type: "TEXT", position: 0 },
        { id: `${tag}-templatefield-link`, label: "Related goal", type: "KINESIS_LINK", position: 1 },
      ] },
    },
  });
  await prisma.customModule.create({
    data: { id: `${tag}-module`, name: "Books", normalizedName: `${tag} books`, icon: "star", color: "#111111", userId, templateId: `${tag}-template` },
  });
  await prisma.object.create({
    data: {
      id: `${tag}-object-item`, type: "CUSTOM_ITEM", name: "Item", userId, templateId: `${tag}-template`,
      fields: { create: [
        { id: `${tag}-itemfield`, label: "L", value: "V" },
        { id: `${tag}-itemfield-link`, label: "", value: "", type: "KINESIS_LINK", templateFieldId: `${tag}-templatefield-link`, links: { create: { id: `${tag}-fieldlink`, targetObjectId: `${tag}-object-goal`, position: 0 } } },
      ] },
    },
  });
  await prisma.customItem.create({
    data: {
      id: `${tag}-item`, name: "Item", moduleId: `${tag}-module`, objectId: `${tag}-object-item`,
    },
  });

  await object("todo", "TODO", "Renew passport");
  await prisma.todo.create({
    data: { id: `${tag}-todo`, name: "Renew passport", userId, objectId: `${tag}-object-todo`, dueDate: new Date() },
  });
}
