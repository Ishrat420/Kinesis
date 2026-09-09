import { describe, expect, it } from "vitest";
import { objectFor } from "@/lib/data/objects";

describe("objectFor.customItem", () => {
  it("carries the module's template id onto the object it creates", () => {
    const result = objectFor.customItem("Passport", "user-1", [], "template-1");
    expect(result.create.templateId).toBe("template-1");
  });

  it("leaves templateId unset for a module with no template", () => {
    const result = objectFor.customItem("Passport", "user-1", [], null);
    expect(result.create.templateId).toBeUndefined();
  });

  it("defaults to unset when no template id is passed at all", () => {
    const result = objectFor.customItem("Passport", "user-1", []);
    expect(result.create.templateId).toBeUndefined();
  });

  it("never sets a template id for object types that can't have one", () => {
    expect(objectFor.document("Passport", "user-1").create.templateId).toBeUndefined();
    expect(objectFor.goal("Save for a house", "user-1").create.templateId).toBeUndefined();
  });
});
