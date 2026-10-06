import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), requireRecentVerificationResponse: vi.fn(), sendPush: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser, requireRecentVerificationResponse: mocks.requireRecentVerificationResponse }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/push/sender", () => ({ getVapidPublicKey: () => "test-public-key", sendPush: mocks.sendPush }));

import { prisma } from "@/lib/data/prisma";
import { seedEverything } from "../settings/seed-everything";
import { getDocuments, getDocument, getDocumentSummary, getExpiringDocuments, getDocumentTypes } from "@/lib/data/documents";
import { getGoals, getGoal, getGoalUnits, getGoalsForLinking, getGoalDashboardSummary, getMilestonesDueSoon, getActiveIncompleteMilestones } from "@/lib/data/goals";
import { getFinanceItems, getFinanceItem } from "@/lib/data/finance";
import { getTodos, getTodo, getTodoSummary, getTodoLinkOptions } from "@/lib/data/todos";
import { getCustomModules, getCustomModulesWithItemCount, getCustomModule, getCustomItem } from "@/lib/data/custom-modules";
import { getTemplates, getTemplate, getTemplateOptions, getTemplateFieldSample } from "@/lib/data/templates";
import { getRelationshipMap } from "@/lib/data/relationships";
import { getKinesisLinkOptions, getKinesisLinkPreviews, getKinesisLinkRecentEvents } from "@/lib/data/kinesis-links";
import { getKinesisLinks, getKinesisLinkSection } from "@/lib/data/object-relationships";
import { getObjectEvents, getRecentActivity } from "@/lib/data/object-event-history";
import { getNeedsAttention } from "@/lib/data/attention";
import { getAttentionRecords } from "@/lib/data/attention-items";
import { getRecentNotifications } from "@/lib/data/notifications";
import { collectNotifications } from "@/lib/data/notification-collection";
import { getCalendarItems } from "@/lib/data/calendar";
import { getUpcomingAndDue } from "@/lib/data/upcoming";
import { getSettings } from "@/lib/data/settings";
import { searchGlobalIndex } from "@/lib/search/engine";
import { runDailyPush } from "@/lib/data/push";
import { GET as exportData } from "@/app/api/settings/export/route";
import { getPersonHistoryAction, getPersonKinesisLinksAction } from "@/app/(app)/relationships/actions";
import { captureLinkOptionsAction } from "@/app/(app)/todos/actions";

/**
 * Probe: user A and user B each own a row in every table. Every read path is
 * called as A; nothing of B's -- an id tagged "pb-" or a name marked LEAKB --
 * may appear in what comes back.
 */

const A = "probe-user-a";
const B = "probe-user-b";
const asUser = (id: string) => mocks.requireKinesisUser.mockResolvedValue({ id, firstName: "Probe", lastName: id, preferredName: null, email: `${id}@example.test` });
const leaks = (value: unknown) => {
  const text = JSON.stringify(value, (_key, v) => (v instanceof Date ? v.toISOString() : v)) ?? "";
  return [...new Set(text.match(/pb-[\w-]+|LEAKB[^"]*/g) ?? [])];
};
const soon = (days: number) => new Date(Date.now() + days * 86_400_000);

async function makeLive(userId: string) {
  await prisma.document.updateMany({ where: { userId }, data: { expiryDate: soon(10), prompt: 30, archived: false } });
  await prisma.goal.updateMany({ where: { userId }, data: { targetDate: soon(5), status: "Active" } });
  await prisma.milestone.updateMany({ where: { goal: { userId } }, data: { dueDate: soon(3), completed: false } });
  await prisma.todo.updateMany({ where: { userId }, data: { dueDate: soon(2), status: "TODO" } });
  await prisma.customItem.updateMany({ where: { module: { userId } }, data: { dueDate: soon(4), archived: false } });
  await prisma.relationshipImportantDate.updateMany({ where: { OR: [{ relationship: { userId } }, { selfPerson: { userId } }] }, data: { date: soon(3) } });
}

describe.sequential("isolation probe: nothing of user B reaches user A", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.createMany({ data: [
      { id: A, firstName: "Probe", lastName: "A", email: "probe-a@example.test" },
      { id: B, firstName: "LEAKB", lastName: "B", email: "probe-b@example.test" },
    ] });
    await seedEverything(A, "pa");
    await seedEverything(B, "pb");
    // B's records get a marker in every human-readable name, so a leak is caught by name as well as by id.
    for (const [table, column] of [["Document", "name"], ["Goal", "name"], ["FinanceItem", "name"], ["Person", "name"], ["Todo", "name"], ["CustomModule", "name"], ["Template", "name"], ["DocumentType", "name"], ["GoalUnit", "name"]] as const) {
      await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = 'LEAKB ' || "${column}" WHERE "userId" = $1`, B);
    }
    await prisma.$executeRawUnsafe(`UPDATE "CustomItem" SET "name" = 'LEAKB ' || "name" WHERE "moduleId" IN (SELECT "id" FROM "CustomModule" WHERE "userId" = $1)`, B);
    await prisma.$executeRawUnsafe(`UPDATE "Milestone" SET "name" = 'LEAKB ' || "name" WHERE "goalId" IN (SELECT "id" FROM "Goal" WHERE "userId" = $1)`, B);
    await prisma.$executeRawUnsafe(`UPDATE "ObjectField" SET "value" = 'LEAKB ' || "value", "label" = 'LEAKB ' || "label" WHERE "objectId" IN (SELECT "id" FROM "Object" WHERE "userId" = $1)`, B);
    await makeLive(A);
    await makeLive(B);
    asUser(A);
    mocks.requireRecentVerificationResponse.mockResolvedValue(true);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  const listReads: [string, () => Promise<unknown>][] = [
    ["getDocuments", () => getDocuments()],
    ["getDocumentSummary", () => getDocumentSummary()],
    ["getExpiringDocuments", () => getExpiringDocuments()],
    ["getDocumentTypes", () => getDocumentTypes()],
    ["getGoals", () => getGoals()],
    ["getGoalUnits", () => getGoalUnits()],
    ["getGoalsForLinking", () => getGoalsForLinking()],
    ["getGoalDashboardSummary", () => getGoalDashboardSummary()],
    ["getMilestonesDueSoon", () => getMilestonesDueSoon()],
    ["getActiveIncompleteMilestones", () => getActiveIncompleteMilestones()],
    ["getFinanceItems", () => getFinanceItems()],
    ["getTodos", () => getTodos()],
    ["getTodoSummary", () => getTodoSummary()],
    ["getTodoLinkOptions", () => getTodoLinkOptions()],
    ["captureLinkOptionsAction", () => captureLinkOptionsAction()],
    ["getCustomModules", () => getCustomModules()],
    ["getCustomModulesWithItemCount", () => getCustomModulesWithItemCount()],
    ["getTemplates", () => getTemplates()],
    ["getTemplateOptions", () => getTemplateOptions()],
    ["getRelationshipMap", () => getRelationshipMap()],
    ["getKinesisLinkOptions", () => getKinesisLinkOptions()],
    ["getRecentActivity", () => getRecentActivity(50)],
    ["getNeedsAttention", () => getNeedsAttention()],
    ["getAttentionRecords", () => getAttentionRecords()],
    ["getRecentNotifications", () => getRecentNotifications(50)],
    ["collectNotifications(A)", () => collectNotifications(A)],
    ["getCalendarItems (±1 year)", () => getCalendarItems(soon(-365), soon(365))],
    ["getUpcomingAndDue", () => getUpcomingAndDue()],
    ["getSettings", () => getSettings()],
    ["search 'LEAKB'", () => searchGlobalIndex("LEAKB", 50)],
    ["search 'Doc'", () => searchGlobalIndex("Doc", 50)],
    ["search 'Goal'", () => searchGlobalIndex("Goal", 50)],
    ["search 'Salary'", () => searchGlobalIndex("Salary", 50)],
    ["search 'Them'", () => searchGlobalIndex("Them", 50)],
    ["export", async () => (await exportData()).json()],
  ];

  it.each(listReads)("%s returns nothing of B's", async (_name, read) => {
    expect(leaks(await read())).toEqual([]);
  });

  it("the list reads are not vacuous: A's own data does come back", async () => {
    const results = await Promise.all([getDocuments(), getGoals(), getFinanceItems(), getTodos(), getCustomModules(), getCalendarItems(soon(-365), soon(365)), collectNotifications(A), searchGlobalIndex("Doc", 50)]);
    for (const result of results) expect(JSON.stringify(result)).toContain("pa-");
  });

  const byIdReads: [string, (tag: "pa" | "pb") => Promise<unknown>][] = [
    ["getDocument", (t) => getDocument(`${t}-doc`)],
    ["getGoal", (t) => getGoal(`${t}-goal`)],
    ["getFinanceItem", (t) => getFinanceItem(`${t}-finance`)],
    ["getTodo", (t) => getTodo(`${t}-todo`)],
    ["getCustomModule", (t) => getCustomModule(`${t}-module`)],
    ["getCustomItem", (t) => getCustomItem(`${t}-module`, `${t}-item`)],
    ["getTemplate", (t) => getTemplate(`${t}-template`)],
    ["getTemplateFieldSample", (t) => getTemplateFieldSample(`${t}-template`)],
    ["getObjectEvents", (t) => getObjectEvents(`${t}-object-goal2`)],
    ["getKinesisLinks", (t) => getKinesisLinks(`${t}-object-goal`)],
    ["getKinesisLinkSection", (t) => getKinesisLinkSection(`${t}-object-goal`)],
    ["getKinesisLinkPreviews", (t) => getKinesisLinkPreviews([`${t}-object-doc`, `${t}-object-goal`, `${t}-object-finance`, `${t}-object-person`, `${t}-object-item`])],
    ["getKinesisLinkRecentEvents", (t) => getKinesisLinkRecentEvents([{ objectId: `${t}-object-goal2`, linkType: null }])],
    ["getPersonHistoryAction", (t) => getPersonHistoryAction(`${t}-object-person`)],
    ["getPersonKinesisLinksAction", (t) => getPersonKinesisLinksAction(`${t}-object-person`)],
  ];

  it.each(byIdReads)("%s with B's ids returns nothing of B's", async (_name, read) => {
    expect(leaks(await read("pb"))).toEqual([]);
  });

  it("the by-id reads are not vacuous: the same reads with A's ids do return data", async () => {
    const results = await Promise.all([getDocument("pa-doc"), getGoal("pa-goal"), getFinanceItem("pa-finance"), getTodo("pa-todo"), getCustomModule("pa-module")]);
    for (const result of results) expect(result).not.toBeNull();
  });

  it("the daily push sends each user's notifications only to that user's own devices", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
    mocks.sendPush.mockResolvedValue("sent");
    await prisma.notificationPushed.deleteMany({ where: { userId: { in: [A, B] } } });
    await runDailyPush();
    const calls = mocks.sendPush.mock.calls as [{ endpoint: string }, unknown][];
    const toA = calls.filter(([device]) => device.endpoint.endsWith("/pa"));
    const toB = calls.filter(([device]) => device.endpoint.endsWith("/pb"));
    expect(toA.length).toBeGreaterThan(0);
    expect(toB.length).toBeGreaterThan(0);
    expect(leaks(toA.map(([, payload]) => payload))).toEqual([]);
    for (const [, payload] of toB) expect(JSON.stringify(payload)).not.toMatch(/pa-/);
  });
});
