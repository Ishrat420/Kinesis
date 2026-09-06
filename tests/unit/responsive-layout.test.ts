import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  NARROWEST_CONTENT_WIDTH,
  PAGE_PADDING,
  fitsNarrowestViewport,
  fixedTrackWidth,
} from "@/lib/layout/responsive";

/**
 * KD-020. Kinesis is one shell with one content column, so "is it responsive"
 * is not a per-page judgement -- it is two rules that hold everywhere.
 *
 * The first is that the shell owns the page padding. The second is that a grid
 * whose columns are declared in pixels cannot narrow: a `44px 1fr` template
 * survives a phone, while `44px 1fr 180px 160px` needs 384px before it draws a
 * single character and pushes the whole page into a horizontal scroll. Such a
 * template belongs behind a breakpoint, with a stacked layout under it.
 *
 * Neither rule is something `next build` or the type-checker can see, and a
 * regression only shows up on a device nobody develops on, so they are checked
 * against the source here.
 *
 * Track lists are written here without their utility prefix on purpose: this
 * file is inside Tailwind's source scan, and a complete class name in a comment
 * would ship dead CSS to every visitor.
 */

const root = resolve(new URL("../..", import.meta.url).pathname);
const SEARCHED = ["app", "components"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const files = SEARCHED.flatMap((directory) => sourceFiles(join(root, directory)));
const sources = new Map(files.map((path) => [relative(root, path), readFileSync(path, "utf8")]));

/** Every arbitrary column template in the source, with the variants that precede it. */
function gridTemplates(source: string) {
  return [...source.matchAll(/([a-z0-9:[\]-]*)grid-cols-\[([^\]\s]+)\]/g)].map(([match, variants, template]) => ({
    className: match,
    template,
    /** A template only has to survive the narrowest viewport when no breakpoint gates it. */
    unconditional: !variants.includes(":"),
  }));
}

describe("fixedTrackWidth", () => {
  it("adds up the pixel tracks and ignores the ones that can give way", () => {
    expect(fixedTrackWidth("44px_1fr_180px_160px")).toBe(384);
    expect(fixedTrackWidth("44px_1fr_44px")).toBe(88);
    expect(fixedTrackWidth("minmax(0,1fr)_minmax(0,1fr)_40px")).toBe(40);
    expect(fixedTrackWidth("0.8fr_1.2fr")).toBe(0);
  });

  it("measures a template against the room a phone actually leaves", () => {
    expect(NARROWEST_CONTENT_WIDTH).toBe(288);
    expect(fitsNarrowestViewport("44px_minmax(0,1fr)")).toBe(true);
    expect(fitsNarrowestViewport("44px_1fr_180px_160px")).toBe(false);
  });
});

describe("the application shell", () => {
  const shell = sources.get(join("app", "(app)", "layout.tsx")) ?? "";

  it("applies the standard page padding once, for every route", () => {
    expect(shell).toContain("PAGE_PADDING");
    expect(PAGE_PADDING).toBe("px-4 sm:px-6 md:px-10");
  });

  it("keeps the content column able to shrink inside the flex row", () => {
    expect(shell).toContain("min-w-0");
  });
});

describe("mobile navigation", () => {
  const topbar = sources.get(join("components", "navigation", "Topbar.tsx")) ?? "";
  const sidebar = sources.get(join("components", "navigation", "Sidebar.tsx")) ?? "";

  it("reaches the drawer only where the sidebar is hidden", () => {
    expect(topbar).toContain("MobileNavDrawer");
    expect(topbar).toContain("md:hidden");
    expect(sidebar).toContain("hidden");
    expect(sidebar).toContain("md:block");
  });

  it("gives the drawer the sidebar's own navigation rather than a copy of it", () => {
    expect(topbar).toContain("<SidebarNav />");
  });
});

describe("grid templates", () => {
  it("keeps every unconditional pixel template inside the narrowest viewport", () => {
    const tooWide = [...sources].flatMap(([path, source]) =>
      gridTemplates(source)
        .filter((grid) => grid.unconditional && !fitsNarrowestViewport(grid.template))
        .map((grid) => `${path}: ${grid.className} needs ${fixedTrackWidth(grid.template)}px`));

    expect(tooWide).toEqual([]);
  });

  it("finds the templates it is meant to be reading", () => {
    const templates = [...sources.values()].flatMap((source) => gridTemplates(source));
    expect(templates.length).toBeGreaterThan(5);
    expect(templates.some((grid) => !grid.unconditional)).toBe(true);
  });
});
