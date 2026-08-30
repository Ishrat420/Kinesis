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
    await expect(updateDocument(ids.documentB, { ...owned, name: "intrusion" })).rejects.toThrow("Document not found");
    await deleteDocument(ids.documentB);
    await deleteUnusedDocumentType("Owner B Type");
    expect(await ownerState("ownerB")).toEqual(before);
  });

  it("keeps every foreign top-level goal mutation inert and creates no side effects", async () => {
    await updateGoalStatusAction(ids.goalA, form({ status: "Completed" }));
    await addTargetAction(ids.goalA, form({ targetValue: "150", currentValue: "25", unit: "items" }));
    await toggleProgressAction(ids.goalA, "showTargetProgress", false);
    await addMilestoneAction(ids.goalA, form({ name: "owner-a-added-milestone" }));
    await removeTargetAction(ids.goalA);
    expect((await ownerState("ownerA")).goals[0].milestones).toHaveLength(2);

    const before = await ownerState("ownerB");
    await updateGoalStatusAction(ids.goalB, form({ status: "Completed" }));
    await expect(addTargetAction(ids.goalB, form({ targetValue: "999", currentValue: "999", unit: "items" }))).rejects.toThrow("Goal not found");
    await removeTargetAction(ids.goalB);
    await toggleProgressAction(ids.goalB, "showTargetProgress", false);
    await addMilestoneAction(ids.goalB, form({ name: "intrusion" }));
    await deleteGoalAction(ids.goalB);
    expect(await ownerState("ownerB")).toEqual(before);
  });

  const milestoneMutations = [
    ["due-date update", (parent: string, child: string) => updateMilestoneDueDateAction(parent, child, form({ dueDate: "2029-01-01" }))],
    ["due-date removal", (parent: string, child: string) => removeMilestoneDueDateAction(parent, child)],
    ["completion toggle", (parent: string, child: string) => toggleMilestoneAction(parent, child, true)],
    ["deletion", (parent: string, child: string) => deleteMilestoneAction(parent, child)],
  ] as const;

  it.each(milestoneMutations)("enforces the full parent/child matrix for milestone %s", async (_name, invoke) => {
    await invoke(ids.goalA, ids.milestoneA);
    const changedA = await ownerState("ownerA");
    expect(changedA).not.toEqual(await (resetAuthorizationDatabase(), ownerState("ownerA")));

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
    await createCustomItemAction(ids.moduleA, form({ name: "owner-a-added-item" }));
    expect((await ownerState("ownerA")).customModules[0].items).toHaveLength(2);
    const before = await ownerState("ownerB");
    await expect(createCustomItemAction(ids.moduleB, form({ name: "intrusion" }))).rejects.toThrow("Module not found");
    await deleteCustomModuleAction(ids.moduleB);
    expect(await ownerState("ownerB")).toEqual(before);
  });

  const customItemMutations = [
    ["update/field replacement", (parent: string, child: string) => updateCustomItemAction(parent, child, form({ name: "changed", fieldLabel: ["replacement"], fieldValue: ["replacement"] }))],
    ["archive toggle", (parent: string, child: string) => toggleCustomItemArchivedAction(parent, child, true)],
    ["deletion", (parent: string, child: string) => deleteCustomItemAction(parent, child)],
  ] as const;

  it.each(customItemMutations)("enforces the full parent/child matrix for custom-item %s", async (_name, invoke) => {
    await invoke(ids.moduleA, ids.itemA);
    const changedA = await ownerState("ownerA");
    expect(changedA).not.toEqual(await (resetAuthorizationDatabase(), ownerState("ownerA")));
    const combinations = [[ids.moduleA, ids.itemB], [ids.moduleB, ids.itemB], [ids.moduleB, ids.itemA], [ids.moduleA, "missing-item"], ["missing-module", ids.itemB]];
    for (const [parent, child] of combinations) {
      const beforeA = await ownerState("ownerA"); const beforeB = await ownerState("ownerB");
      await invoke(parent, child).catch(() => undefined);
      expect(await ownerState("ownerA")).toEqual(beforeA);
      expect(await ownerState("ownerB")).toEqual(beforeB);
    }
  });

  it("treats foreign and unknown notification IDs alike", async () => {
    await markNotificationRead(ids.notificationA);
    await expect(prisma.notification.findUniqueOrThrow({ where: { id: ids.notificationA } })).resolves.toMatchObject({ readAt: expect.any(Date) });
    const before = await ownerState("ownerB");
    await markNotificationRead(ids.notificationB);
    await markNotificationRead("missing-notification");
    expect(await ownerState("ownerB")).toEqual(before);
  });

  it("rejects a mixed owned, foreign, and missing relationship-goal payload atomically", async () => {
    const beforeA = await ownerState("ownerA");
    const beforeB = await ownerState("ownerB");
    await expect(saveRelationshipMap({
      people: [
        { id: "replacement-self", name: "Replacement", detail: "You", x: 0, y: 0, size: 84, color: "#111111", icon: "user" },
        { id: "replacement-person", name: "Replacement person", detail: "Friend", x: 1, y: 1, size: 84, color: "#222222", icon: "heart" },
      ],
      relationships: [{
        id: "replacement-relationship", from: "replacement-self", to: "replacement-person", type: "Friend", notes: "must not be inserted",
        practices: [], reflections: [], importantDates: [], linkedGoals: [ids.goalA, ids.goalB, "missing-goal"],
      }],
    })).rejects.toThrow("One or more linked goals were not found.");
    expect(await ownerState("ownerA")).toEqual(beforeA);
    expect(await ownerState("ownerB")).toEqual(beforeB);
  });

  it("can switch the shared authentication fixture between both owners", async () => {
    authenticateAs("ownerB");
    await expect(getDocument(ids.documentB)).resolves.toMatchObject({ name: ids.documentB });
    await expect(getDocument(ids.documentA)).resolves.toBeNull();
  });
});
