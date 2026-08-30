import { describe, expect, it } from "vitest";
import { isRouteActive } from "@/lib/navigation/active-route";

describe("isRouteActive", () => {
  it("marks a module active on its own route", () => {
    expect(isRouteActive("/documents", "/documents")).toBe(true);
  });

  it("keeps a module active on its nested routes", () => {
    expect(isRouteActive("/documents/expiring-soon", "/documents")).toBe(true);
    expect(isRouteActive("/goals/milestones/due-soon", "/goals")).toBe(true);
    expect(isRouteActive("/custom-modules/abc123", "/custom-modules/abc123")).toBe(true);
    expect(isRouteActive("/custom-modules/abc123/items/xyz", "/custom-modules/abc123")).toBe(true);
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(isRouteActive("/documents-archive", "/documents")).toBe(false);
    expect(isRouteActive("/custom-modules/abc123x", "/custom-modules/abc123")).toBe(false);
  });

  it("keeps the dashboard active only on the dashboard", () => {
    expect(isRouteActive("/", "/")).toBe(true);
    expect(isRouteActive("/goals", "/")).toBe(false);
  });

  it("ignores trailing slashes, query strings, and fragments", () => {
    expect(isRouteActive("/documents/", "/documents")).toBe(true);
    expect(isRouteActive("/calendar?month=2026-08", "/calendar")).toBe(true);
    expect(isRouteActive("/settings#privacy", "/settings")).toBe(true);
    expect(isRouteActive("/?filter=at-risk", "/")).toBe(true);
  });

  it("treats a missing pathname as inactive", () => {
    expect(isRouteActive(null, "/goals")).toBe(false);
    expect(isRouteActive(undefined, "/")).toBe(false);
  });
});
