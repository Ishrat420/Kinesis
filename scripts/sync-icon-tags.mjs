#!/usr/bin/env node
/**
 * Copies Lucide's own search tags for every custom-module icon into
 * lib/custom-modules/icon-tags.json, so the icon picker's search knows that
 * "vehicle" means Car without anyone typing that list out (see
 * lib/custom-modules/icon-search.ts).
 *
 *   node scripts/sync-icon-tags.mjs
 *
 * Rerun it after adding icons to lib/custom-modules/icons.tsx. The tags come
 * from `lucide-static` at the same version as the installed `lucide-react`,
 * fetched with `npm pack` into a temporary folder -- the 50 MB package is never
 * installed, and only the tags for icons the picker actually offers are kept.
 * Our own words for each icon live in icon-keywords.ts, not here.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const require = createRequire(join(root, "package.json"));
const lucide = require("lucide-react");
const { version } = require("lucide-react/package.json");

// key: Component pairs from the CUSTOM_MODULE_ICONS object literal.
const source = readFileSync(join(root, "lib/custom-modules/icons.tsx"), "utf8");
const body = source.slice(source.indexOf("CUSTOM_MODULE_ICONS = {"), source.indexOf("} as const"));
// Only pairs naming a real Lucide component, so a comment like "circles: Lucide
// has no..." inside the object isn't mistaken for an icon.
const icons = [...body.matchAll(/(\w+):\s*([A-Z]\w*)/g)]
  .map(([, key, component]) => ({ key, component }))
  .filter(({ component }) => typeof lucide[component] === "object" || typeof lucide[component] === "function");
if (!icons.length) throw new Error("No icons found in lib/custom-modules/icons.tsx");

const folder = mkdtempSync(join(tmpdir(), "lucide-tags-"));
let tags;
try {
  const tarball = execFileSync("npm", ["pack", `lucide-static@${version}`, "--silent", "--pack-destination", folder], { encoding: "utf8" }).trim().split("\n").pop();
  execFileSync("tar", ["xzf", join(folder, tarball), "-C", folder, "package/tags.json"]);
  tags = JSON.parse(readFileSync(join(folder, "package/tags.json"), "utf8"));
} finally {
  rmSync(folder, { recursive: true, force: true });
}

/** Lucide's file name for a component: its canonical name (old aliases resolve to it), kebab-cased. */
function lucideName(component) {
  const canonical = lucide[component]?.displayName ?? component;
  return canonical.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([a-zA-Z])(\d)/g, "$1-$2").toLowerCase();
}

const output = {};
const missing = [];
for (const { key, component } of icons) {
  const name = lucideName(component);
  if (!tags[name]) missing.push(`${key} (${component} -> ${name})`);
  // Lucide lists its most telling tags first; past twenty they drift (ShieldCheck
  // runs to sixty, ending in "todo" and "done"), so the tail is left behind.
  output[key] = { lucide: name, tags: (tags[name] ?? []).slice(0, 20) };
}

writeFileSync(join(root, "lib/custom-modules/icon-tags.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote tags for ${icons.length} icons from lucide-static@${version}.`);
if (missing.length) console.warn(`No Lucide tags for: ${missing.join(", ")}`);
