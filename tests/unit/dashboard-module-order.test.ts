import { describe, expect, it } from "vitest";
import { DASHBOARD_SYSTEM_MODULE_IDS, MAX_CUSTOM_DASHBOARD_MODULES, moveId, resolveDashboardOrder } from "@/lib/dashboard/module-order";

/**
 * The dashboard's Module Shortcuts grid used to hold its order in plain
 * client state with nothing behind it -- a drag, an add, or a remove
 * silently reverted on the next reload. `resolveDashboardOrder` is the one
 * function both sides of the persisted value go through: restoring what
 * was saved (a custom module in it may have been deleted since) and
 * validating what a client submits to save (so a stale or crafted payload
 * can't corrupt what gets stored).
 */
describe("resolveDashboardOrder", () => {
  it("keeps every system module id, in the order given", () => {
    expect(resolveDashboardOrder(["finance", "documents", "relationships", "goals"], new Set()))
      .toEqual(["finance", "documents", "relationships", "goals"]);
  });

  it("appends any system module id missing from the input", () => {
    expect(resolveDashboardOrder(["finance"], new Set())).toEqual(["finance", ...DASHBOARD_SYSTEM_MODULE_IDS.filter((id) => id !== "finance")]);
  });

  it("fills in the full default order for an empty input", () => {
    expect(resolveDashboardOrder([], new Set())).toEqual([...DASHBOARD_SYSTEM_MODULE_IDS]);
  });

  it("drops a custom module id that no longer exists", () => {
    expect(resolveDashboardOrder(["documents", "deleted-module", "goals", "finance", "relationships"], new Set(["module-1"])))
      .toEqual(["documents", "goals", "finance", "relationships"]);
  });

  it("keeps a custom module id that still exists, in its saved position", () => {
    const order = ["documents", "module-1", "goals", "finance", "relationships"];
    expect(resolveDashboardOrder(order, new Set(["module-1"]))).toEqual(order);
  });

  it("caps custom module ids at the maximum, keeping the earliest and dropping the rest", () => {
    const existing = new Set(["module-1", "module-2", "module-3"]);
    const order = ["documents", "module-1", "module-2", "module-3", "goals", "finance", "relationships"];
    const result = resolveDashboardOrder(order, existing);
    expect(result.filter((id) => existing.has(id))).toHaveLength(MAX_CUSTOM_DASHBOARD_MODULES);
    expect(result).toEqual(["documents", "module-1", "module-2", "goals", "finance", "relationships"]);
  });

  it("drops a duplicate id, keeping only its first occurrence", () => {
    expect(resolveDashboardOrder(["documents", "documents", "goals", "finance", "relationships"], new Set()))
      .toEqual(["documents", "goals", "finance", "relationships"]);
  });
});

/**
 * The Module Shortcuts grid's mouse drag (native HTML5 DnD) and its touch
 * drag (pointer events, since iOS/Android never fire an HTML5 dragstart)
 * both reorder through this one function, so a phone and a desktop can't
 * land on different positions for the same gesture.
 */
describe("moveId", () => {
  it("moves the dragged id to just before the target", () => {
    expect(moveId(["documents", "goals", "finance", "relationships"], "relationships", "goals"))
      .toEqual(["documents", "relationships", "goals", "finance"]);
  });

  it("moves the dragged id forward past the target", () => {
    expect(moveId(["documents", "goals", "finance", "relationships"], "documents", "finance"))
      .toEqual(["goals", "documents", "finance", "relationships"]);
  });

  it("is a no-op when the dragged id is dropped on itself", () => {
    const order = ["documents", "goals", "finance", "relationships"];
    expect(moveId(order, "goals", "goals")).toEqual(order);
  });

  it("leaves the order unchanged when the target id isn't in it", () => {
    const order = ["documents", "goals", "finance", "relationships"];
    expect(moveId(order, "goals", "missing")).toEqual(order);
  });

  it("never mutates the array it was given", () => {
    const order = ["documents", "goals", "finance", "relationships"];
    moveId(order, "relationships", "goals");
    expect(order).toEqual(["documents", "goals", "finance", "relationships"]);
  });
});
