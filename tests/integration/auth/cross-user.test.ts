import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authenticateAs, ids, ownerState, resetAuthorizationDatabase } from "./fixture";
import { prisma } from "@/lib/data/prisma";
import { getDocument, updateDocument, deleteDocument, deleteUnusedDocumentType } from "@/lib/data/documents";
import { getGoal } from "@/lib/data/goals";
import { getCustomItem, getCustomModule } from "@/lib/data/custom-modules";
import { markNotificationRead } from "@/lib/data/notifications";
import { addMilestoneAction, addTargetAction, deleteGoalAction, deleteMilestoneAction, removeMilestoneDueDateAction, removeTargetAction, toggleMilestoneAction, toggleProgressAction, updateGoalStatusAction, updateMilestoneDueDateAction } from "@/app/(app)/goals/actions";
import { deleteFinanceItem, saveFinanceItem } from "@/app/(app)/finance/actions";
import { createCustomItemAction, deleteCustomItemAction, deleteCustomModuleAction, toggleCustomItemArchivedAction, updateCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { saveRelationshipMap } from "@/app/(app)/relationships/actions";
import { emptySelfRelationship } from "@/lib/relationships";

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
    await updateDocument(ids.documentA, owned);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: ids.documentA } })).resolves.toMatchObject({ name: owned.name });
    const before = await ownerState("ownerB");
    // The data layer still refuses by throwing; it is the action wrapping it that
    // turns a refusal into a message the form can show.
    await expect(updateDocument(ids.documentB, { ...owned, name: "intrusion" })).rejects.toThrow("This document no longer exists.");
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
    await saveFinanceItem({ id: ids.financeA, kind: "asset", name: "owner-a-updated-finance", amount: 101 }, true);
    await expect(prisma.financeItem.findUniqueOrThrow({ where: { id: ids.financeA } })).resolves.toMatchObject({ amount: 101 });
    const before = await ownerState("ownerB");
    await expect(saveFinanceItem({ id: ids.financeB, kind: "asset", name: "intrusion", amount: 999 }, false)).rejects.toThrow();
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
    ["update/field replacement", (parent: string, child: string) => updateCustomItemAction(parent, child, {}, form({ name: "changed", fieldLabel: ["replacement"], fieldValue: ["replacement"] }))],
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

  it("rejects a mixed owned, foreign, and missing relationship-goal payload atomically", async () => {
    const beforeA = await ownerState("ownerA");
    const beforeB = await ownerState("ownerB");
    // The map reports a refusal rather than throwing it, so the canvas can show
    // the reason instead of the owner losing the edit to a discarded promise.
    await expect(saveRelationshipMap({
      people: [
        { id: "replacement-self", name: "Replacement", detail: "You", x: 0, y: 0, size: 84, color: "#111111", icon: "user", selfRelationship: emptySelfRelationship() },
        { id: "replacement-person", name: "Replacement person", detail: "Friend", x: 1, y: 1, size: 84, color: "#222222", icon: "heart", selfRelationship: emptySelfRelationship() },
      ],
      relationships: [{
        id: "replacement-relationship", from: "replacement-self", to: "replacement-person", type: "Friend", notes: "must not be inserted",
        practices: [], reflections: [], importantDates: [], linkedGoals: [ids.goalA, ids.goalB, "missing-goal"],
      }],
    })).resolves.toEqual({ error: "One or more linked goals were not found." });
    expect(await ownerState("ownerA")).toEqual(beforeA);
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

    const result = await saveRelationshipMap({
      people: [
        { id: ids.personA1, name: "Owner A self", detail: "You", x: 0, y: 0, size: 84, color: "#111111", icon: "user", selfRelationship: emptySelfRelationship() },
        { id: ids.personA2, name: "owner-a-private-person", detail: "Friend", x: 1, y: 1, size: 84, color: "#222222", icon: "heart", selfRelationship: emptySelfRelationship() },
        // Smuggled: another account's real, existing person id.
        { id: ids.personB1, name: "intrusion", detail: "You", x: 2, y: 2, size: 84, color: "#333333", icon: "user", selfRelationship: emptySelfRelationship() },
        { id: ids.personB2, name: "intrusion", detail: "Friend", x: 3, y: 3, size: 84, color: "#444444", icon: "heart", selfRelationship: emptySelfRelationship() },
      ],
      relationships: [
        { id: ids.relationshipA, from: ids.personA1, to: ids.personA2, type: "Friend", notes: "owner-a-relationship-notes", practices: [], reflections: [], importantDates: [], linkedGoals: [] },
        // Smuggled: another account's real, existing connection id.
        { id: ids.relationshipB, from: ids.personB1, to: ids.personB2, type: "intrusion", notes: "intrusion", practices: [], reflections: [], importantDates: [], linkedGoals: [] },
      ],
    });

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
