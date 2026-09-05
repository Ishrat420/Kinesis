import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * A Server Component may render a Client Component, but it may not use a value
 * that lives in a "use client" module. The bundler replaces every export of such
 * a module with a client reference, so calling a function or reading a property
 * from one throws at request time:
 *
 *   Attempted to call isTodoScope() from the server but isTodoScope is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * `next build` cannot catch this. A dynamic page is never executed at build
 * time, so the build is green and every request 500s -- which is exactly how it
 * reached production once. Shared vocabulary belongs in lib/, importable from
 * both sides; this fails the build here instead.
 *
 * Components are exempt: rendering one from the server is the whole point.
 * PascalCase is how this codebase distinguishes them.
 */

const root = resolve(new URL("../..", import.meta.url).pathname);
const SEARCHED = ["app", "components", "lib"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const files = SEARCHED.flatMap((directory) => sourceFiles(join(root, directory)));
const read = new Map(files.map((path) => [path, readFileSync(path, "utf8")]));

const isClientModule = (source: string) => /^\s*["']use client["']/m.test(source);
const isComponentName = (name: string) => /^[A-Z]/.test(name);

/** Resolves an import specifier to the file it names, or null for a package. */
function resolveImport(fromFile: string, specifier: string) {
  const base = specifier.startsWith("@/")
    ? join(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(fromFile, "..", specifier)
      : null;
  if (!base) return null;
  return [".ts", ".tsx", "/index.ts", "/index.tsx"].map((suffix) => `${base}${suffix}`).find((path) => read.has(path)) ?? null;
}

/** Named bindings of one import statement, dropping `type` -- types are erased. */
function valueImports(clause: string) {
  const named = /\{([^}]*)\}/.exec(clause);
  if (!named) return [];
  return named[1].split(",").map((part) => part.trim()).flatMap((part) => {
    if (!part || part.startsWith("type ")) return [];
    return [(part.split(/\s+as\s+/)[0] ?? "").trim()];
  }).filter(Boolean);
}

describe("server/client module boundary", () => {
  it("never imports a non-component value from a \"use client\" module into a server module", () => {
    const violations: string[] = [];

    for (const [path, source] of read) {
      if (isClientModule(source)) continue;

      for (const match of source.matchAll(/import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
        const [, clause, specifier] = match;
        if (clause.trim().startsWith("type ")) continue;
        const target = resolveImport(path, specifier);
        if (!target || !isClientModule(read.get(target)!)) continue;

        for (const name of valueImports(clause)) {
          if (isComponentName(name)) continue;
          violations.push(`${relative(root, path)} imports "${name}" from the client module ${relative(root, target)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
