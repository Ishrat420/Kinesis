import { describe, expect, it } from "vitest";
import { locateObject, locateObjects, type LocatableObject } from "@/lib/objects/locations";

/**
 * Every picker that offers objects to point at -- Kinesis Link fields, quick
 * capture's "Link to" -- reads where a record lives from here, so a type that
 * resolves wrongly resolves wrongly everywhere.
 */

const object = (overrides: Partial<LocatableObject>): LocatableObject => ({
  id: "object-1", type: "DOCUMENT", name: "Passport Somalia",
  document: null, goal: null, todo: null, person: null, financeItem: null, customItem: null,
  ...overrides,
});

describe("locateObject", () => {
  it("opens a document at its own page", () => {
    expect(locateObject(object({ type: "DOCUMENT", document: { id: "doc-1" } })))
      .toMatchObject({ module: "Documents", href: "/documents/doc-1" });
  });

  it("opens a goal at its own page", () => {
    expect(locateObject(object({ type: "GOAL", goal: { id: "goal-1" } })))
      .toMatchObject({ module: "Goals", href: "/goals/goal-1" });
  });

  it("opens a To-Do at its row on the To-Do page, which is where a To-Do is read", () => {
    expect(locateObject(object({ type: "TODO", todo: { id: "todo-1" } })))
      .toMatchObject({ module: "To-Dos", href: "/todos#todo-todo-1" });
  });

  it("takes a custom item's module name, icon and colour from the module holding it", () => {
    expect(locateObject(object({
      type: "CUSTOM_ITEM",
      customItem: { id: "item-1", module: { id: "module-1", name: "Vehicles", icon: "car", color: "#123456" } },
    }))).toMatchObject({ module: "Vehicles", href: "/custom-modules/module-1/items/item-1", icon: "car", color: "#123456" });
  });

  it("returns nothing for an identity whose typed record is not attached", () => {
    expect(locateObject(object({ type: "DOCUMENT" }))).toBeNull();
  });

  it("leaves unresolvable identities out of a list instead of failing the whole picker", () => {
    const located = locateObjects([
      object({ id: "a", type: "GOAL", goal: { id: "goal-1" } }),
      object({ id: "b", type: "DOCUMENT" }),
    ]);
    expect(located.map(({ objectId }) => objectId)).toEqual(["a"]);
  });
});
