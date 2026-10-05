import { describe, expect, it } from "vitest";
import { searchIcons } from "@/lib/custom-modules/icon-search";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";

const top = (query: string, count = 1) => searchIcons(query).filter((result) => result.matched).slice(0, count).map((result) => result.key);

describe("searchIcons", () => {
  it("puts the icon named exactly what was typed first", () => {
    expect(top("car")).toEqual(["car"]);
    expect(top("bills")).toEqual(["bills"]);
    expect(top("Laundry")).toEqual(["laundry"]);
  });

  it("finds an icon by our own life-admin words", () => {
    expect(top("dentist")).toEqual(["doctor"]);
    expect(top("rego")).toEqual(["car"]);
    expect(top("subscription")).toEqual(["subscriptions"]);
    expect(top("passport")).toEqual(["identity"]);
  });

  it("finds rings for weddings and engagements", () => {
    expect(top("Wedding rings")).toEqual(["rings"]);
    expect(top("Engagement rings", 2)).toEqual(expect.arrayContaining(["rings", "gem"]));
    expect(top("engagement", 2)).toEqual(expect.arrayContaining(["rings", "gem"]));
  });

  it("finds an icon by Lucide's synonyms", () => {
    expect(top("vehicle", 3)).toContain("car");
    expect(top("tumble dryer")).toEqual(["laundry"]);
  });

  it("finds an icon by Lucide's own name for it", () => {
    expect(top("washing machine")).toEqual(["laundry"]);
    expect(top("piggy")).toEqual(["savings"]);
  });

  it("matches while still typing", () => {
    expect(top("grocer")).toEqual(["groceries"]);
    expect(top("insur", 2)).toContain("insurance");
  });

  it("forgives plurals and a one-letter typo", () => {
    expect(top("cars")).toEqual(["car"]);
    expect(top("vehical", 3)).toContain("car");
    expect(top("grocerys")).toEqual(["groceries"]);
  });

  it("uses every word of a longer name, like a module's own name", () => {
    expect(top("Car maintenance")).toEqual(["car"]);
    expect(top("My dog walks")).toEqual(["dog"]);
  });

  it("keeps every icon, matches first and the rest after in their usual order", () => {
    const results = searchIcons("car");
    expect(results).toHaveLength(Object.keys(CUSTOM_MODULE_ICONS).length);
    const firstUnmatched = results.findIndex((result) => !result.matched);
    expect(results.slice(firstUnmatched).every((result) => !result.matched)).toBe(true);
    const unmatchedKeys: string[] = results.slice(firstUnmatched).map((result) => result.key);
    const usualOrder = Object.keys(CUSTOM_MODULE_ICONS).filter((key) => unmatchedKeys.includes(key));
    expect(unmatchedKeys).toEqual(usualOrder);
  });

  it("leaves the usual order alone, nothing marked, with no query", () => {
    for (const query of ["", "   ", "a"]) {
      const results = searchIcons(query);
      expect(results.map((result) => result.key)).toEqual(Object.keys(CUSTOM_MODULE_ICONS));
      expect(results.some((result) => result.matched)).toBe(false);
    }
  });

  it("matches nothing for nonsense", () => {
    expect(searchIcons("zzqx").some((result) => result.matched)).toBe(false);
  });
});
