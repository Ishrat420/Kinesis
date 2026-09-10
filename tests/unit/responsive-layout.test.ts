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

const globalStyles = readFileSync(join(root, "app", "globals.css"), "utf8");
const customFieldStyles = sources.get(join("components", "custom-fields", "field-styles.ts")) ?? "";

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

/**
 * The top bar carries `backdrop-blur`, and an element with a backdrop-filter
 * becomes the containing block for its `position: fixed` descendants. Anything
 * mounted from the bar that means "the viewport" therefore gets "the 72px
 * header" instead, silently: the drawer drew itself 280x72 with the navigation
 * scrolled out of sight inside it, and only a phone ever showed it.
 *
 * An overlay opened from the bar has two ways out -- render into `document.body`
 * through a portal, or state a height the clipped containing block cannot
 * shrink -- and `inset-0` alone is neither.
 */
describe("overlays opened from the top bar", () => {
  const mounted = ["MobileNavDrawer.tsx", "NotificationBell.tsx"];

  it.each(mounted)("%s does not trust inset-0 to mean the viewport", (file) => {
    const source = sources.get(join("components", "navigation", file)) ?? "";
    expect(source).not.toBe("");

    // `fixed inset-0` is only honest once the subtree has left the header, so a
    // file that writes one has to portal. Sizing the overlay instead is the
    // other way out, and leaves no `inset-0` here to find.
    const insetOverlays = source.match(/className="fixed inset-0[^"]*"/g) ?? [];
    if (insetOverlays.length) expect(source).toContain("createPortal");
  });

  it("keeps the drawer's overlay in document.body", () => {
    const drawer = sources.get(join("components", "navigation", "MobileNavDrawer.tsx")) ?? "";
    expect(drawer).toContain("createPortal");
    expect(drawer).toContain("document.body");
  });

  it("still has a backdrop filter on the bar, which is what makes this necessary", () => {
    expect(sources.get(join("components", "navigation", "Topbar.tsx"))).toContain("backdrop-blur");
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

describe("phone form controls", () => {
  it("keeps shared controls at 16px until the sm breakpoint", () => {
    // Mobile Safari enlarges a page when a focused text-like control is below
    // 16px. These two shared styles cover text, date, number, select, and
    // textarea controls at both 320px and 375px (both are below `sm`).
    expect(globalStyles).toMatch(/\.input\s*{[\s\S]*?text-base[\s\S]*?sm:text-sm[\s\S]*?}/);
    expect(customFieldStyles).toContain("text-base");
    expect(customFieldStyles).toContain("sm:text-sm");
  });

  it("keeps the remaining document controls phone-safe", () => {
    const fields = sources.get(join("app", "(app)", "documents", "DocumentFields.tsx")) ?? "";
    const typeSelect = sources.get(join("app", "(app)", "documents", "DocumentTypeSelect.tsx")) ?? "";

    expect(fields).toContain("text-base");
    expect(fields).toContain("sm:text-sm");
    expect(typeSelect).toContain("text-base");
    expect(typeSelect).toContain("sm:text-sm");
  });

  it("gives audited compact actions 44px targets and visible keyboard focus", () => {
    const audited = [
      join("app", "(app)", "documents", "DocumentTypeSelect.tsx"),
      join("components", "custom-fields", "CustomFieldsEditor.tsx"),
      join("app", "(app)", "settings", "templates", "TemplateFieldsEditor.tsx"),
    ];

    for (const path of audited) {
      const source = sources.get(path) ?? "";
      expect(source).toContain("h-11");
      expect(source).toContain("w-11");
      expect(source).toContain("focus-visible:ring-2");
    }
  });

  it("stacks dense field editors before restoring wider layouts", () => {
    const documentFields = sources.get(join("app", "(app)", "documents", "DocumentFields.tsx")) ?? "";
    const customFields = sources.get(join("components", "custom-fields", "CustomFieldsEditor.tsx")) ?? "";
    const templateValues = sources.get(join("components", "custom-fields", "TemplateFieldValues.tsx")) ?? "";
    const templateEditor = sources.get(join("app", "(app)", "settings", "templates", "TemplateFieldsEditor.tsx")) ?? "";

    expect(documentFields).toContain("grid-cols-1 gap-2 sm:grid-cols-");
    expect(customFields).toContain("grid-cols-1 items-start gap-2 transition-all sm:grid-cols-");
    expect(templateValues).toContain("grid-cols-1 items-start gap-2 sm:grid-cols-");
    expect(templateEditor).toContain("grid-cols-1 items-center gap-2 md:grid-cols-");
  });

  it("lets long field content shrink and wrap at the 320px minimum", () => {
    const audited = [
      join("app", "(app)", "documents", "DocumentFields.tsx"),
      join("components", "custom-fields", "CustomFieldsEditor.tsx"),
      join("components", "custom-fields", "TemplateFieldValues.tsx"),
      join("app", "(app)", "settings", "templates", "page.tsx"),
    ];

    for (const path of audited) {
      const source = sources.get(path) ?? "";
      expect(source).toContain("min-w-0");
      expect(source).toContain("break-words");
    }

    expect(customFieldStyles).toContain("min-w-0");
  });
});
