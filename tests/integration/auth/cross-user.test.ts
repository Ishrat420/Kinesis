import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authenticateAs, ids, ownerBMarkers, ownerState, resetAuthorizationDatabase } from "./fixture";
import { prisma } from "@/lib/data/prisma";
import { getDocument, updateDocument, deleteDocument, deleteUnusedDocumentType } from "@/lib/data/documents";
import { getGoal } from "@/lib/data/goals";
import { getCustomItem, getCustomModule } from "@/lib/data/custom-modules";
import { markNotificationRead } from "@/lib/data/notifications";
import { addMilestoneAction, addTargetAction, deleteGoalAction, deleteMilestoneAction, removeMilestoneDueDateAction, removeTargetAction, toggleMilestoneAction, toggleProgressAction, updateGoalStatusAction, updateMilestoneDueDateAction } from "@/app/(app)/goals/actions";
import { deleteFinanceItem, saveFinanceItem } from "@/app/(app)/finance/actions";
import { createCustomItemAction, deleteCustomItemAction, deleteCustomModuleAction, toggleCustomItemArchivedAction, updateCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { saveRelationshipMap } from "@/app/(app)/relationships/actions";
import { getRelationshipMap } from "@/lib/data/relationships";
import { emptySelfRelationship } from "@/lib/relationships";
import { createTodoAction, deleteTodoAction, saveTodoDetailsAction, setTodoStatusAction, updateTodoDueDateAction, captureLinkOptionsAction } from "@/app/(app)/todos/actions";
import { getTodo, getTodos } from "@/lib/data/todos";
import { addKinesisLinkAction, dismissAttentionItem, removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";
import { getKinesisLinks, getKinesisLinkSection } from "@/lib/data/object-relationships";
import { getKinesisLinkOptions, getKinesisLinkPreviews, getKinesisLinkRecentEvents } from "@/lib/data/kinesis-links";
import { updateDocumentAction } from "@/app/(app)/documents/actions";
import { updateGoalFieldsAction } from "@/app/(app)/goals/actions";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";
import { searchGlobalIndex } from "@/lib/search/engine";
import { getCalendarItems } from "@/lib/data/calendar";
import { collectNotifications } from "@/lib/data/notification-collection";
import { markAllNotificationsRead } from "@/lib/data/notifications";
import { getUpcomingAndDue } from "@/lib/data/upcoming";
import { getNeedsAttention } from "@/lib/data/attention";
import { dismissalKey, parseDismissalKey } from "@/lib/attention/dismissal";
import { cloneTemplateAction, deleteTemplateAction, updateTemplateAction } from "@/app/(app)/settings/templates/actions";
import { getTemplate, getTemplateFieldSample, getTemplates } from "@/lib/data/templates";
import { createCustomModuleAction } from "@/app/(app)/custom-modules/actions";
import { updateDashboardModuleOrderAction } from "@/app/(app)/settings/actions";
import { deletePushSubscription, hasPushSubscription, markPushedNotificationOpened, savePushSubscription } from "@/lib/data/push";
import { getPersonHistoryAction, getPersonKinesisLinksAction, saveMapGeometry } from "@/app/(app)/relationships/actions";

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  return data;
};

describe.sequential("cross-user authorization contract", () => {
  beforeEach(resetAuthorizationDatabase);
  afterAll(async () => { await prisma.user.deleteMany(); await prisma.$disconnect(); });

  it.each([
    ["getDocument(documentId)", () => getDocument(ids.documentA), () => getDocument(ids.documentB)],
    ["getGoal(goalId)", () => getGoal(ids.goalA), () => getGoal(ids.goalB)],
    ["getCustomModule(moduleId)", () => getCustomModule(ids.moduleA), () => getCustomModule(ids.moduleB)],
    ["getCustomItem(moduleId, itemId)", () => getCustomItem(ids.moduleA, ids.itemA), () => getCustomItem(ids.moduleB, ids.itemB)],
  ])("allows an owned read but hides a foreign ID: %s", async (_name, owned, foreign) => {
    await expect(owned()).resolves.not.toBeNull();
    await expect(foreign()).resolves.toBeNull();
  });

  it("keeps foreign document fields, notifications, and types unchanged", async () => {
    const owned = { name: "owner-a-updated-document", type: "Owner A Type", status: "Active", notes: "changed", customFields: [{ label: "New A field", value: "changed" }] };
    const documentA = await prisma.document.findUniqueOrThrow({ where: { id: ids.documentA } });
    await updateDocument(ids.documentA, owned, documentA.updatedAt);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: ids.documentA } })).resolves.toMatchObject({ name: owned.name });
    const before = await ownerState("ownerB");
    // The data layer still refuses by throwing; it is the action wrapping it that
    // turns a refusal into a message the form can show. The ownership check
    // fails before the version check ever runs, so the stamp passed here does
    // not need to match documentB's real one.
    await expect(updateDocument(ids.documentB, { ...owned, name: "intrusion" }, new Date())).rejects.toThrow("This document no longer exists.");
    await deleteDocument(ids.documentB);
    await deleteUnusedDocumentType("Owner B Type");
    expect(await ownerState("ownerB")).toEqual(before);
  });

  it("keeps every foreign top-level goal mutation inert and creates no side effects", async () => {
    await updateGoalStatusAction(ids.goalA, {}, form({ status: "Completed" }));
    await addTargetAction(ids.goalA, {}, form({ targetValue: "150", currentValue: "25", unit: "items" }));
    await toggleProgressAction(ids.goalA, "showTargetProgress", false);
    await addMilestoneAction(ids.goalA, {}, form({ name: "owner-a-added-milestone" }));
    await removeTargetAction(ids.goalA, {}, form({ confirmed: "true" }));
    expect((await ownerState("ownerA")).goals[0].milestones).toHaveLength(2);

    const before = await ownerState("ownerB");
    await updateGoalStatusAction(ids.goalB, {}, form({ status: "Completed" }));
    await expect(addTargetAction(ids.goalB, {}, form({ targetValue: "999", currentValue: "999", unit: "items" }))).resolves.toEqual({ error: "This goal no longer exists." });
    await removeTargetAction(ids.goalB, {}, form({ confirmed: "true" }));
    await toggleProgressAction(ids.goalB, "showTargetProgress", false);
    await addMilestoneAction(ids.goalB, {}, form({ name: "intrusion" }));
    await deleteGoalAction(ids.goalB);
    expect(await ownerState("ownerB")).toEqual(before);
  });

  const milestoneMutations = [
    ["due-date update", (parent: string, child: string) => updateMilestoneDueDateAction(parent, child, {}, form({ dueDate: "2029-01-01" }))],
    ["due-date removal", (parent: string, child: string) => removeMilestoneDueDateAction(parent, child)],
    ["completion toggle", (parent: string, child: string) => toggleMilestoneAction(parent, child, true)],
    ["deletion", (parent: string, child: string) => deleteMilestoneAction(parent, child)],
  ] as const;

  it.each(milestoneMutations)("enforces the full parent/child matrix for milestone %s", async (_name, invoke) => {
    await invoke(ids.goalA, ids.milestoneA);
    const changedA = await ownerState("ownerA");
    await resetAuthorizationDatabase();
    expect(changedA).not.toEqual(await ownerState("ownerA"));

    const combinations = [
      [ids.goalA, ids.milestoneB], [ids.goalB, ids.milestoneB], [ids.goalB, ids.milestoneA],
      [ids.goalA, "missing-milestone"], ["missing-goal", ids.milestoneB],
    ];
    for (const [parent, child] of combinations) {
      const beforeA = await ownerState("ownerA"); const beforeB = await ownerState("ownerB");
      await invoke(parent, child).catch(() => undefined);
      expect(await ownerState("ownerA")).toEqual(beforeA);
      expect(await ownerState("ownerB")).toEqual(beforeB);
    }
  });

  it("prevents foreign finance updates, deletes, and ID reuse", async () => {
    await saveFinanceItem({ id: ids.financeA, kind: "asset", name: "owner-a-updated-finance", amount: 101 });
    await expect(prisma.financeItem.findUniqueOrThrow({ where: { id: ids.financeA } })).resolves.toMatchObject({ amount: 101 });
    const before = await ownerState("ownerB");
    await expect(saveFinanceItem({ id: ids.financeB, kind: "asset", name: "intrusion", amount: 999 })).rejects.toThrow();
    await deleteFinanceItem(ids.financeB);
    expect(await ownerState("ownerB")).toEqual(before);
  });

  it("rejects foreign custom-module creation and deletion", async () => {
    await createCustomItemAction(ids.moduleA, {}, form({ name: "owner-a-added-item" }));
    expect((await ownerState("ownerA")).customModules[0].items).toHaveLength(2);
    const before = await ownerState("ownerB");
    await expect(createCustomItemAction(ids.moduleB, {}, form({ name: "intrusion" }))).resolves.toEqual({ error: "This module no longer exists." });
    await deleteCustomModuleAction(ids.moduleB);
    expect(await ownerState("ownerB")).toEqual(before);
  });

  const customItemMutations = [
    // The ownership check fails before the version check ever runs (see
    // updateCustomItemAction), so a real, current stamp is fetched here only
    // to exercise the actual owned-item update -- it plays no role in any of
    // the cross-owner refusals this same case is run against below.
    ["update/field replacement", async (parent: string, child: string) => {
      const item = await prisma.customItem.findFirst({ where: { id: child }, select: { updatedAt: true } });
      return updateCustomItemAction(parent, child, {}, form({ name: "changed", fieldLabel: ["replacement"], fieldValue: ["replacement"], updatedAt: (item?.updatedAt ?? new Date()).toISOString() }));
    }],
    ["archive toggle", (parent: string, child: string) => toggleCustomItemArchivedAction(parent, child, true)],
    ["deletion", (parent: string, child: string) => deleteCustomItemAction(parent, child)],
  ] as const;

  it.each(customItemMutations)("enforces the full parent/child matrix for custom-item %s", async (_name, invoke) => {
    await invoke(ids.moduleA, ids.itemA);
    const changedA = await ownerState("ownerA");
    await resetAuthorizationDatabase();
    expect(changedA).not.toEqual(await ownerState("ownerA"));
    const combinations = [[ids.moduleA, ids.itemB], [ids.moduleB, ids.itemB], [ids.moduleB, ids.itemA], [ids.moduleA, "missing-item"], ["missing-module", ids.itemB]];
    for (const [parent, child] of combinations) {
      const beforeA = await ownerState("ownerA"); const beforeB = await ownerState("ownerB");
      await invoke(parent, child).catch(() => undefined);
      expect(await ownerState("ownerA")).toEqual(beforeA);
      expect(await ownerState("ownerB")).toEqual(beforeB);
    }
  });

  /**
   * A notification is derived, so marking one read names the record it is about
   * -- and that name arrives from the browser. A foreign or unknown record must
   * write nothing rather than leave a marker pointing across accounts.
   */
  it("treats foreign and unknown notification records alike", async () => {
    const ownKey = `document:${ids.documentA}:EXPIRED:2030-06-01`;
    await markNotificationRead(ownKey, "document", ids.documentA);
    await expect(prisma.notificationRead.findFirst({ where: { itemKey: ownKey } })).resolves.toMatchObject({ userId: ids.ownerA });

    const before = await ownerState("ownerB");
    await markNotificationRead(`document:${ids.documentB}:EXPIRED:2030-06-01`, "document", ids.documentB);
    await markNotificationRead("document:missing:EXPIRED:2030-06-01", "document", "missing-document");
    expect(await ownerState("ownerB")).toEqual(before);
    await expect(prisma.notificationRead.count({ where: { userId: ids.ownerA, documentId: ids.documentB } })).resolves.toBe(0);
  });

  it("saves a mixed owned, foreign, and missing relationship-goal payload, linking only the owned goal", async () => {
    const beforeB = await ownerState("ownerB");
    const mapVersion = (await getRelationshipMap()).version;
    // A foreign or missing goal id used to refuse the whole save -- blocking
    // the new people and relationship along with it -- rather than just being
    // left out of what gets linked. ownerB's goal must still never end up
    // linked to ownerA's relationship; that guarantee is what this now pins,
    // not a wholesale refusal.
    await expect(saveRelationshipMap({
      people: [
        { id: "replacement-self", name: "Replacement", detail: "You", x: 0, y: 0, size: 84, color: "#111111", icon: "user", selfRelationship: emptySelfRelationship(), objectId: null },
        { id: "replacement-person", name: "Replacement person", detail: "Friend", x: 1, y: 1, size: 84, color: "#222222", icon: "heart", selfRelationship: emptySelfRelationship(), objectId: null },
      ],
      relationships: [{
        id: "replacement-relationship", from: "replacement-self", to: "replacement-person", type: "Friend", notes: "must be inserted",
        practices: [], reflections: [], importantDates: [], linkedGoals: [ids.goalA, ids.goalB, "missing-goal"], createdAt: "2026-01-01T00:00:00.000Z",
      }],
    }, mapVersion)).resolves.toEqual({ savedAt: expect.any(Number), version: mapVersion + 1 });

    const relationship = (await ownerState("ownerA")).relationships.find((item) => item.id === "replacement-relationship");
    expect(relationship?.linkedGoals).toEqual([expect.objectContaining({ goalId: ids.goalA })]);
    expect(await ownerState("ownerB")).toEqual(beforeB);
  });

  /**
   * Practices, reflections, and important dates are scoped to the ids the
   * payload names, not to ids independently verified as this account's own --
   * see lib/relationships/actions.ts's ownerScope. Today a smuggled foreign id
   * still can't reach that scope: the people/relationships loop above treats
   * an id it doesn't already own as new and tries to create it, which collides
   * with the real row's primary key and aborts the whole transaction. This
   * pins the outcome an owner actually depends on -- a foreign account's
   * people, connections, and everything hanging off them stay untouched --
   * so it still catches a regression even if that loop is ever rewritten in a
   * way that stops colliding (an upsert, say) and the ownerScope check ends up
   * doing the work alone.
   */
  it("keeps a foreign self/relationship id smuggled into the payload, and everything hanging off it, untouched", async () => {
    await prisma.connectionPractice.create({ data: { id: "owner-b-practice", relationshipId: ids.relationshipB, title: "Weekly call", position: 0 } });
    await prisma.relationshipReflection.create({ data: { id: "owner-b-reflection", relationshipId: ids.relationshipB, text: "Good chat.", reflectedAt: new Date("2030-01-01") } });
    await prisma.relationshipImportantDate.create({ data: { id: "owner-b-date", selfPersonId: ids.personB1, label: "Anniversary", date: new Date("2030-06-01") } });

    const beforeA = await ownerState("ownerA");
    const beforeB = await ownerState("ownerB");
    const mapVersion = (await getRelationshipMap()).version;

    const result = await saveRelationshipMap({
      people: [
        { id: ids.personA1, name: "Owner A self", detail: "You", x: 0, y: 0, size: 84, color: "#111111", icon: "user", selfRelationship: emptySelfRelationship(), objectId: null },
        { id: ids.personA2, name: "owner-a-private-person", detail: "Friend", x: 1, y: 1, size: 84, color: "#222222", icon: "heart", selfRelationship: emptySelfRelationship(), objectId: null },
        // Smuggled: another account's real, existing person id.
        { id: ids.personB1, name: "intrusion", detail: "You", x: 2, y: 2, size: 84, color: "#333333", icon: "user", selfRelationship: emptySelfRelationship(), objectId: null },
        { id: ids.personB2, name: "intrusion", detail: "Friend", x: 3, y: 3, size: 84, color: "#444444", icon: "heart", selfRelationship: emptySelfRelationship(), objectId: null },
      ],
      relationships: [
        { id: ids.relationshipA, from: ids.personA1, to: ids.personA2, type: "Friend", notes: "owner-a-relationship-notes", practices: [], reflections: [], importantDates: [], linkedGoals: [], createdAt: "2026-01-01T00:00:00.000Z" },
        // Smuggled: another account's real, existing connection id.
        { id: ids.relationshipB, from: ids.personB1, to: ids.personB2, type: "intrusion", notes: "intrusion", practices: [], reflections: [], importantDates: [], linkedGoals: [], createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    }, mapVersion);

    expect(result.error).toBeTruthy();
    expect(await ownerState("ownerA")).toEqual(beforeA);
    expect(await ownerState("ownerB")).toEqual(beforeB);
  });

  it("can switch the shared authentication fixture between both owners", async () => {
    authenticateAs("ownerB");
    await expect(getDocument(ids.documentB)).resolves.toMatchObject({ name: ids.documentB });
    await expect(getDocument(ids.documentA)).resolves.toBeNull();
  });
});

/**
 * Every data module beyond the core records above: To-Dos, Kinesis Links,
 * search, the calendar, notifications and attention, templates, settings,
 * push devices and the relationship map's per-person reads. Two rules
 * throughout: owner A acting on owner B's ids changes nothing of B's, and
 * nothing of B's -- an id or any of `ownerBMarkers` -- reaches A through a
 * read, even the reads that gather from every module at once.
 */
const leaksFromB = (value: unknown) => {
  const text = JSON.stringify(value) ?? "";
  return [...ownerBMarkers.filter((marker) => text.includes(marker)), ...(text.match(/object-[a-z]+-b\d?\b/g) ?? [])];
};

/** Runs a foreign mutation the way a client would: a refusal may come back as an error result or a thrown refusal; either way, B's data must be exactly as it was. */
async function expectOwnerBUntouched(attempt: () => Promise<unknown>) {
  const before = await ownerState("ownerB");
  try { await attempt(); } catch { /* a thrown refusal is as good as a returned one */ }
  expect(await ownerState("ownerB")).toEqual(before);
}

// Dates in the fixture sit in early 2030; this is "now" for every date-driven read below.
const MARCH_2030 = new Date("2030-03-25T12:00:00.000Z");

describe.sequential("cross-user authorization contract: every other data module", () => {
  beforeEach(resetAuthorizationDatabase);
  afterAll(async () => { await prisma.user.deleteMany(); await prisma.$disconnect(); });

  describe("To-Dos", () => {
    it.each([
      ["status change", () => setTodoStatusAction(ids.todoB, "DONE")],
      ["due date change", () => updateTodoDueDateAction(ids.todoB, {}, form({ dueDate: "2031-01-01" }))],
      ["details save", () => saveTodoDetailsAction(ids.todoB, {}, form({ target: "TODO", notes: "changed", linkObjectId: "object-document-a" }))],
      ["deletion", () => deleteTodoAction(ids.todoB)],
    ])("leaves a foreign To-Do untouched: %s", async (_name, attempt) => {
      await expectOwnerBUntouched(attempt);
    });

    it("refuses to create a To-Do linked to a foreign record, creating nothing", async () => {
      const before = await getTodos();
      const result = await createTodoAction({}, form({ name: "Sneaky", linkObjectId: "object-document-b" }));
      expect(result.error).toBeTruthy();
      expect(await getTodos()).toEqual(before);
    });

    it("refuses to link an owned To-Do to a foreign record", async () => {
      const result = await saveTodoDetailsAction(ids.todoA, {}, form({ target: "TODO", linkObjectId: "object-document-b" }));
      expect(result.error).toBeTruthy();
      await expect(getTodo(ids.todoA)).resolves.toMatchObject({ links: [], linkedFrom: [] });
    });

    it("hides a foreign To-Do, and never offers a foreign record as a link target", async () => {
      await expect(getTodo(ids.todoB)).resolves.toBeNull();
      expect(leaksFromB(await getTodos())).toEqual([]);
      expect(leaksFromB(await captureLinkOptionsAction())).toEqual([]);
    });
  });

  describe("Kinesis Links", () => {
    const direction = (value: string) => form({ direction: value });

    it.each([
      ["from an owned record to a foreign one", "object-goal-a", "object-document-b"],
      ["from a foreign record to an owned one", "object-goal-b", "object-document-a"],
      ["between two foreign records", "object-goal-b", "object-document-b"],
    ])("refuses a link %s", async (_name, from, to) => {
      const before = await prisma.objectRelationship.count();
      const result = await addKinesisLinkAction(from, {}, form({ targetObjectId: to, direction: "BLOCKS|forward" }));
      expect(result.error).toBeTruthy();
      expect(await prisma.objectRelationship.count()).toBe(before);
    });

    it.each([
      ["retype via the foreign record", () => updateKinesisLinkAction("object-goal-b", ids.linkB, direction("BLOCKS|forward"))],
      ["retype via an owned record", () => updateKinesisLinkAction("object-goal-a", ids.linkB, direction("BLOCKS|forward"))],
      ["removal via the foreign record", () => removeKinesisLinkAction("object-goal-b", ids.linkB)],
      ["removal via an owned record", () => removeKinesisLinkAction("object-document-a", ids.linkB)],
    ])("leaves a foreign link untouched: %s", async (_name, attempt) => {
      await expectOwnerBUntouched(attempt);
    });

    const foreignLinkField = () => JSON.stringify([{ label: "Related", type: "KINESIS_LINK", targetObjectIds: ["object-document-b"] }]);
    const noLinkToForeignDocument = async () => {
      expect(await prisma.fieldLink.count({ where: { targetObjectId: "object-document-b" } })).toBe(0);
      expect(await prisma.objectRelationship.count({ where: { userId: ids.ownerA, OR: [{ sourceObjectId: "object-document-b" }, { targetObjectId: "object-document-b" }] } })).toBe(0);
    };

    it("refuses a Kinesis Link field on a document that points at a foreign record", async () => {
      const document = await prisma.document.findUniqueOrThrow({ where: { id: ids.documentA } });
      const data = form({ name: ids.documentA, type: "Owner A Type", updatedAt: document.updatedAt.toISOString() });
      data.set(CUSTOM_FIELDS_FORM_KEY, foreignLinkField());
      expect((await updateDocumentAction(ids.documentA, {}, data)).error).toBeTruthy();
      await noLinkToForeignDocument();
    });

    it("refuses a Kinesis Link field on a goal that points at a foreign record", async () => {
      const data = new FormData();
      data.set(CUSTOM_FIELDS_FORM_KEY, foreignLinkField());
      expect((await updateGoalFieldsAction(ids.goalA, {}, data)).error).toBeTruthy();
      await noLinkToForeignDocument();
    });

    it("reads nothing through a foreign record's id, while an owned record shows its own link", async () => {
      await expect(getKinesisLinks("object-goal-b")).resolves.toEqual([]);
      await expect(getKinesisLinkSection("object-document-b")).resolves.toEqual({ links: [], previews: {}, recentEvents: {} });
      await expect(getKinesisLinkPreviews(["object-document-b", "object-goal-b", "object-finance-b", "object-item-b", "object-person-b2", "object-todo-b"])).resolves.toEqual({});
      expect(leaksFromB(await getKinesisLinkRecentEvents([{ objectId: "object-goal-b", linkType: null }, { objectId: "object-document-b", linkType: "SUPPORTS" }]))).toEqual([]);
      expect(leaksFromB(await getKinesisLinkOptions())).toEqual([]);
      await expect(getKinesisLinks("object-goal-a")).resolves.toMatchObject([{ id: ids.linkA, target: { objectId: "object-document-a" } }]);
    });
  });

  describe("search", () => {
    // Each pair: something only owner B's data contains, and owner A's equivalent -- so a pass can't be a search that finds nothing at all.
    it.each([
      ["document name", ids.documentB, ids.documentA],
      ["document custom field value", "owner-b-field-value", "owner-a-field-value"],
      ["document notes", "owner-b-document-notes", "owner-a-document-notes"],
      ["goal name", ids.goalB, ids.goalA],
      ["milestone name", "owner-b-milestone", "owner-a-milestone"],
      ["finance item", "owner-b-finance", "owner-a-finance"],
      ["custom module", "Owner B Module", "Owner A Module"],
      ["custom item", "owner-b-private-item", "owner-a-private-item"],
      ["custom item field value", "owner-b-item-field", "owner-a-item-field"],
      ["person", "owner-b-private-person", "owner-a-private-person"],
      ["relationship notes", "owner-b-relationship-notes", "owner-a-relationship-notes"],
      ["to-do", "owner-b-private-todo", "owner-a-private-todo"],
    ])("never returns owner B's %s, while finding owner A's", async (_name, foreignTerm, ownedTerm) => {
      expect(leaksFromB(await searchGlobalIndex(foreignTerm, 50))).toEqual([]);
      expect((await searchGlobalIndex(ownedTerm, 50)).length).toBeGreaterThan(0);
    });

    it("never returns owner B's records for a term both owners' data contains", async () => {
      const results = await searchGlobalIndex("private", 50);
      expect(results.length).toBeGreaterThan(0);
      expect(leaksFromB(results)).toEqual([]);
    });
  });

  describe("the calendar", () => {
    const year2030 = [new Date("2029-12-01T00:00:00.000Z"), new Date("2030-12-31T23:59:59.999Z")] as const;

    it("shows owner A's dated records from every module and none of owner B's", async () => {
      const items = await getCalendarItems(...year2030);
      expect(leaksFromB(items)).toEqual([]);
      const text = JSON.stringify(items);
      for (const own of [ids.documentA, "owner-a-milestone", "owner-a-private-todo"]) expect(text).toContain(own);
    });

    it("shows owner B only owner B's", async () => {
      authenticateAs("ownerB");
      const text = JSON.stringify(await getCalendarItems(...year2030));
      expect(text).toContain(ids.documentB);
      expect(text).not.toMatch(/owner-a-/);
    });
  });

  describe("notifications and attention", () => {
    it("derives owner A's bell from owner A's records only", async () => {
      const bell = await collectNotifications(ids.ownerA, MARCH_2030);
      expect(bell.length).toBeGreaterThan(0);
      expect(leaksFromB(bell)).toEqual([]);
    });

    it("keeps Upcoming & Due and Needs Attention to owner A's records", async () => {
      const [upcoming, attention] = await Promise.all([getUpcomingAndDue(MARCH_2030), getNeedsAttention(MARCH_2030)]);
      expect(upcoming.length + attention.length).toBeGreaterThan(0);
      expect(leaksFromB(upcoming)).toEqual([]);
      expect(leaksFromB(attention)).toEqual([]);
    });

    it("marks only owner A's notifications read when A marks everything read", async () => {
      await expectOwnerBUntouched(() => markAllNotificationsRead());
    });

    it("can't dismiss, or mark read, an attention row for a foreign record", async () => {
      const key = dismissalKey("document", ids.documentB, "EXPIRED", "2030-04-01");
      expect(parseDismissalKey(key)).not.toBeNull();
      await expectOwnerBUntouched(() => dismissAttentionItem(key));
      await expectOwnerBUntouched(() => markPushedNotificationOpened(`document:${ids.documentB}:EXPIRED:2030-04-01`));
      expect(await prisma.attentionDismissal.count({ where: { userId: ids.ownerA } })).toBe(0);
      expect(await prisma.notificationRead.count({ where: { userId: ids.ownerA, documentId: ids.documentB } })).toBe(0);

      // The same dismissal on owner A's own document does go through, so the refusal above is about ownership.
      await dismissAttentionItem(dismissalKey("document", ids.documentA, "EXPIRED", "2030-04-01"));
      expect(await prisma.attentionDismissal.count({ where: { userId: ids.ownerA, documentId: ids.documentA } })).toBe(1);
    });
  });

  describe("templates", () => {
    it.each([
      ["update", async () => {
        const template = await prisma.template.findUniqueOrThrow({ where: { id: ids.templateB } });
        return updateTemplateAction(ids.templateB, {}, form({ name: "Taken over", updatedAt: template.updatedAt.toISOString() }));
      }],
      ["clone", () => cloneTemplateAction(ids.templateB, {}, form({ name: "Copied" }))],
      ["deletion", () => deleteTemplateAction(ids.templateB)],
    ])("leaves a foreign template untouched, and copies nothing to A: %s", async (_name, attempt) => {
      await expectOwnerBUntouched(attempt);
      expect(await prisma.template.count({ where: { userId: ids.ownerA } })).toBe(1);
    });

    it("refuses a custom module built on a foreign template", async () => {
      const result = await createCustomModuleAction({}, form({ name: "Borrowed", icon: "star", color: "#123456", templateId: ids.templateB }));
      expect(result.error).toBeTruthy();
      expect(await prisma.customModule.count({ where: { userId: ids.ownerA } })).toBe(1);
    });

    it("reads nothing of a foreign template", async () => {
      await expect(getTemplate(ids.templateB)).resolves.toBeNull();
      await expect(getTemplateFieldSample(ids.templateB)).resolves.toBeNull();
      expect(leaksFromB(await getTemplates())).toEqual([]);
    });
  });

  describe("settings and push devices", () => {
    it("drops a foreign custom module from a dashboard order rather than saving it", async () => {
      await updateDashboardModuleOrderAction(["documents", "goals", "finance", "relationships", ids.moduleA, ids.moduleB]);
      const settings = await prisma.userSettings.findUnique({ where: { userId: ids.ownerA } });
      expect(settings?.dashboardModuleOrder).toContain(ids.moduleA);
      expect(settings?.dashboardModuleOrder).not.toContain(ids.moduleB);
    });

    it("can neither see nor remove a foreign push device", async () => {
      await expect(hasPushSubscription("https://push.example.test/owner-b")).resolves.toBe(false);
      await expectOwnerBUntouched(() => deletePushSubscription("https://push.example.test/owner-b"));
    });

    it("moves a shared device to whoever registered it last, so it never carries two owners' pushes", async () => {
      await savePushSubscription({ endpoint: "https://push.example.test/owner-b", keys: { p256dh: "a-p256dh", auth: "a-auth" } }, null);
      const devices = await prisma.webPushSubscription.findMany({ where: { endpoint: "https://push.example.test/owner-b" } });
      expect(devices).toEqual([expect.objectContaining({ userId: ids.ownerA })]);
    });
  });

  describe("the relationship map's per-person reads and geometry", () => {
    it("returns no history or links for a foreign person", async () => {
      await expect(getPersonHistoryAction("object-person-b2")).resolves.toEqual([]);
      await expect(getPersonKinesisLinksAction("object-person-b2")).resolves.toEqual([]);
    });

    it("never moves a foreign person's bubble", async () => {
      await expectOwnerBUntouched(() => saveMapGeometry([{ id: ids.personB2, x: 1, y: 2, size: 90 }]));
    });
  });
});
