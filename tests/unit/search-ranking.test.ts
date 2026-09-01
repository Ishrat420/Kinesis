import { describe, expect, it } from "vitest";
import { rankSearchEntries } from "@/lib/search/rank";
import type { SearchEntry } from "@/lib/search/types";

const entry = (overrides: Partial<SearchEntry> & Pick<SearchEntry, "id" | "title">): SearchEntry => ({
  subtitle: "",
  href: `/${overrides.id}`,
  kind: "Document",
  keywords: [],
  ...overrides,
});

const idsOf = (entries: SearchEntry[]) => entries.map((match) => match.id);

describe("rankSearchEntries: deciding which entries match at all", () => {
  it("returns nothing for an empty or whitespace-only query rather than the whole index", () => {
    const index = [entry({ id: "a", title: "Passport" })];

    expect(rankSearchEntries(index, "")).toEqual([]);
    expect(rankSearchEntries(index, "   ")).toEqual([]);
  });

  it("returns nothing for a query made only of punctuation, which normalises away", () => {
    expect(rankSearchEntries([entry({ id: "a", title: "Passport" })], "!!! ???")).toEqual([]);
  });

  it("matches on a partial word, so results appear while the user is still typing", () => {
    const index = [entry({ id: "a", title: "Passport" })];

    expect(idsOf(rankSearchEntries(index, "pass"))).toEqual(["a"]);
  });

  it("matches case-insensitively", () => {
    const index = [entry({ id: "a", title: "Passport" })];

    expect(idsOf(rankSearchEntries(index, "PASSPORT"))).toEqual(["a"]);
  });

  it("matches against the subtitle as well as the title", () => {
    const index = [entry({ id: "a", title: "Renewal", subtitle: "Passport" })];

    expect(idsOf(rankSearchEntries(index, "passport"))).toEqual(["a"]);
  });

  it("matches against hidden keywords that are indexed but never displayed", () => {
    const index = [entry({ id: "a", title: "Renewal", keywords: ["N1234567", "Australia"] })];

    expect(idsOf(rankSearchEntries(index, "n1234567"))).toEqual(["a"]);
  });

  it("requires every term in a multi-word query to match, in any field", () => {
    const index = [
      entry({ id: "both", title: "Home loan", subtitle: "Mortgage" }),
      entry({ id: "one", title: "Home insurance", subtitle: "Policy" }),
    ];

    expect(idsOf(rankSearchEntries(index, "home mortgage"))).toEqual(["both"]);
  });

  it("ignores term order, since the terms are matched independently", () => {
    const index = [entry({ id: "a", title: "Home loan", subtitle: "Mortgage" })];

    expect(idsOf(rankSearchEntries(index, "mortgage home"))).toEqual(["a"]);
  });

  it("excludes an entry when any single term is missing", () => {
    const index = [entry({ id: "a", title: "Home loan", subtitle: "Mortgage" })];

    expect(rankSearchEntries(index, "home mortgage boat")).toEqual([]);
  });
});

describe("rankSearchEntries: normalisation of accents and punctuation", () => {
  it("matches an accented title from an unaccented query, and the reverse", () => {
    const index = [entry({ id: "a", title: "Café Résumé" })];

    expect(idsOf(rankSearchEntries(index, "cafe resume"))).toEqual(["a"]);
    expect(idsOf(rankSearchEntries([entry({ id: "b", title: "Cafe Resume" })], "café"))).toEqual(["b"]);
  });

  it("treats punctuation as a word separator so hyphenated titles are searchable by word", () => {
    const index = [entry({ id: "a", title: "Medi-Care Card (2026)" })];

    expect(idsOf(rankSearchEntries(index, "medi care"))).toEqual(["a"]);
    expect(idsOf(rankSearchEntries(index, "2026"))).toEqual(["a"]);
  });

  it("collapses repeated separators rather than producing empty terms", () => {
    const index = [entry({ id: "a", title: "Passport" })];

    expect(idsOf(rankSearchEntries(index, "  passport   "))).toEqual(["a"]);
  });
});

describe("rankSearchEntries: ordering results by how strongly they match", () => {
  it("ranks an exact title match above a title that merely starts with the term", () => {
    const index = [
      entry({ id: "prefix", title: "Passport renewal" }),
      entry({ id: "exact", title: "Passport" }),
    ];

    expect(idsOf(rankSearchEntries(index, "passport"))).toEqual(["exact", "prefix"]);
  });

  it("ranks a title prefix above a match in the middle of the title", () => {
    const index = [
      entry({ id: "contains", title: "Australian passport" }),
      entry({ id: "prefix", title: "Passport renewal" }),
    ];

    expect(idsOf(rankSearchEntries(index, "passport"))).toEqual(["prefix", "contains"]);
  });

  it("ranks a title match above a subtitle match", () => {
    const index = [
      entry({ id: "subtitle", title: "Renewal", subtitle: "Passport" }),
      entry({ id: "title", title: "Australian passport" }),
    ];

    expect(idsOf(rankSearchEntries(index, "passport"))).toEqual(["title", "subtitle"]);
  });

  it("ranks a subtitle match above a keyword-only match", () => {
    const index = [
      entry({ id: "keyword", title: "Renewal", keywords: ["passport"] }),
      entry({ id: "subtitle", title: "Renewal", subtitle: "Passport" }),
    ];

    expect(idsOf(rankSearchEntries(index, "passport"))).toEqual(["subtitle", "keyword"]);
  });

  it("sums the score across terms so an entry matching both strongly wins", () => {
    const index = [
      entry({ id: "weak", title: "Records", keywords: ["home", "loan"] }),
      entry({ id: "strong", title: "Home loan" }),
    ];

    expect(idsOf(rankSearchEntries(index, "home loan"))).toEqual(["strong", "weak"]);
  });

  it("breaks a score tie by the original index order, keeping results stable", () => {
    const index = [
      entry({ id: "first", title: "Passport" }),
      entry({ id: "second", title: "Passport" }),
      entry({ id: "third", title: "Passport" }),
    ];

    expect(idsOf(rankSearchEntries(index, "passport"))).toEqual(["first", "second", "third"]);
  });
});

describe("rankSearchEntries: limiting how many results come back", () => {
  const many = Array.from({ length: 25 }, (_, index) => entry({ id: `entry-${index}`, title: `Passport ${index}` }));

  it("returns at most ten results by default", () => {
    expect(rankSearchEntries(many, "passport")).toHaveLength(10);
  });

  it("honours an explicit limit", () => {
    expect(rankSearchEntries(many, "passport", 3)).toHaveLength(3);
  });

  it("returns everything that matches when fewer entries than the limit match", () => {
    const index = [...many, entry({ id: "unique", title: "Passport", subtitle: "Renewal receipt" })];

    expect(idsOf(rankSearchEntries(index, "passport receipt", 10))).toEqual(["unique"]);
  });

  it("keeps the highest-scoring results when the limit truncates the list", () => {
    const index = [
      ...Array.from({ length: 12 }, (_, order) => entry({ id: `weak-${order}`, title: `Renewal ${order}`, keywords: ["passport"] })),
      entry({ id: "exact", title: "Passport" }),
    ];

    expect(idsOf(rankSearchEntries(index, "passport", 2))[0]).toBe("exact");
  });

  it("returns an empty list for an empty index", () => {
    expect(rankSearchEntries([], "passport")).toEqual([]);
  });
});
