import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// `after()` needs Next's real request-scoped context to defer work, which a
// bare handler call in a test never has -- mocked to capture the callback's
// promise instead. This also means the real behavior (the response is sent
// before the write finishes) has to be respected here, not assumed away:
// each test explicitly waits for `pending` via `flushAfter()` before
// checking the database, the same way a real caller could observe the
// write completing only after their own response already arrived.
const mocks = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => { mocks.pending.push(Promise.resolve().then(callback)); } }));

import { prisma } from "@/lib/data/prisma";
import { POST } from "@/app/api/csp-report/route";

async function flushAfter() {
  await Promise.all(mocks.pending);
  mocks.pending.length = 0;
}

/**
 * The whole point of this route: the CSP header in next.config.ts is
 * report-only with nowhere to send reports until this exists. These prove
 * a real violation, in either shape a browser sends it, actually reaches
 * the database -- not just that the normalizer returns the right shape in
 * isolation (tests/unit/csp-reports.test.ts already covers that).
 */
describe.sequential("POST /api/csp-report", () => {
  beforeEach(async () => {
    mocks.pending.length = 0;
    await prisma.cspViolationReport.deleteMany();
  });

  afterAll(async () => {
    await prisma.cspViolationReport.deleteMany();
    await prisma.$disconnect();
  });

  it("persists a legacy report-uri violation and responds 204 before any caller could observe the write", async () => {
    const request = new Request("https://kinesis.test/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({ "csp-report": {
        "document-uri": "https://kinesis.test/goals",
        "violated-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js",
        disposition: "report",
      } }),
    });

    const response = await POST(request);
    await flushAfter();

    expect(response.status).toBe(204);
    const rows = await prisma.cspViolationReport.findMany();
    expect(rows).toEqual([expect.objectContaining({
      documentUri: "https://kinesis.test/goals",
      violatedDirective: "script-src-elem",
      blockedUri: "https://evil.example/x.js",
      disposition: "report",
    })]);
  });

  it("persists a batch of modern Reporting API violations", async () => {
    const request = new Request("https://kinesis.test/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/reports+json" },
      body: JSON.stringify([
        { type: "csp-violation", url: "https://kinesis.test/todos", body: { documentURL: "https://kinesis.test/todos", effectiveDirective: "style-src-attr", blockedURL: "inline", disposition: "report" } },
        { type: "csp-violation", url: "https://kinesis.test/documents", body: { documentURL: "https://kinesis.test/documents", effectiveDirective: "img-src", blockedURL: "https://evil.example/y.png", disposition: "enforce" } },
      ]),
    });

    const response = await POST(request);
    await flushAfter();

    expect(response.status).toBe(204);
    const rows = await prisma.cspViolationReport.findMany({ orderBy: { documentUri: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ documentUri: "https://kinesis.test/documents", blockedUri: "https://evil.example/y.png" });
    expect(rows[1]).toMatchObject({ documentUri: "https://kinesis.test/todos", blockedUri: "inline" });
  });

  it("rejects an unrecognised content type without touching the database", async () => {
    const request = new Request("https://kinesis.test/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(415);
    await expect(prisma.cspViolationReport.findMany()).resolves.toEqual([]);
  });

  it("rejects a body larger than the size cap without reading it", async () => {
    const request = new Request("https://kinesis.test/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report", "content-length": "999999" },
      body: JSON.stringify({ "csp-report": { "document-uri": "https://kinesis.test" } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    await expect(prisma.cspViolationReport.findMany()).resolves.toEqual([]);
  });

  it("does not fail the response even when the body isn't valid JSON", async () => {
    const request = new Request("https://kinesis.test/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: "not json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
