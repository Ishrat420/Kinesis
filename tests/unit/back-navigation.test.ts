import { describe, expect, it } from "vitest";
import { parentPath } from "@/lib/navigation/back";

describe("parentPath", () => {
  it("has no back on the main sections", () => {
    for (const path of ["/", "/todos", "/calendar", "/documents", "/finance", "/goals", "/relationships", "/settings", "/custom-modules/abc"]) {
      expect(parentPath(path), path).toBeNull();
    }
  });

  it("goes from a detail page up to its section", () => {
    expect(parentPath("/documents/doc1")).toBe("/documents");
    expect(parentPath("/documents/expiring-soon")).toBe("/documents");
    expect(parentPath("/finance/item1")).toBe("/finance");
    expect(parentPath("/goals/goal1")).toBe("/goals");
    expect(parentPath("/todos/todo1")).toBe("/todos");
  });

  it("skips path segments that aren't pages of their own", () => {
    expect(parentPath("/goals/milestones/due-soon")).toBe("/goals");
    expect(parentPath("/custom-modules/abc/items/item1")).toBe("/custom-modules/abc");
  });

  it("steps up one level at a time through nested settings", () => {
    expect(parentPath("/settings/templates/t1")).toBe("/settings/templates");
    expect(parentPath("/settings/templates")).toBe("/settings");
  });

  it("sends the profile page to Settings, matching its desktop back link", () => {
    expect(parentPath("/user")).toBe("/settings");
    expect(parentPath("/user/security")).toBe("/settings");
  });

  it("ignores a trailing slash, query or hash", () => {
    expect(parentPath("/documents/doc1/")).toBe("/documents");
    expect(parentPath("/documents/doc1?tab=history#top")).toBe("/documents");
    expect(parentPath(null)).toBeNull();
  });
});
