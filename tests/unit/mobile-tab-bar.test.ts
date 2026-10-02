import { describe, expect, it } from "vitest";
import { tabForPath, tabSlot } from "@/lib/navigation/tab-bar";

describe("tabForPath", () => {
  it("matches Home only on the dashboard itself", () => {
    expect(tabForPath("/")).toBe("home");
  });

  it("keeps To-dos and Calendar current on their nested routes", () => {
    expect(tabForPath("/todos")).toBe("todos");
    expect(tabForPath("/todos/abc123")).toBe("todos");
    expect(tabForPath("/calendar")).toBe("calendar");
    expect(tabForPath("/calendar?view=week")).toBe("calendar");
  });

  it("shows More for every page reached through the More sheet", () => {
    expect(tabForPath("/documents")).toBe("more");
    expect(tabForPath("/finance/abc")).toBe("more");
    expect(tabForPath("/custom-modules/xyz")).toBe("more");
    expect(tabForPath("/settings")).toBe("more");
  });

  it("does not light To-dos for a route that only shares its prefix", () => {
    expect(tabForPath("/todos-archive")).toBe("more");
  });

  it("falls back to Home before the path is known", () => {
    expect(tabForPath(null)).toBe("home");
  });
});

describe("tabSlot", () => {
  it("skips the centre slot, which belongs to the + button", () => {
    expect(tabSlot("home")).toBe(0);
    expect(tabSlot("todos")).toBe(1);
    expect(tabSlot("calendar")).toBe(3);
    expect(tabSlot("more")).toBe(4);
  });
});
