import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/prisma", () => ({ prisma: {} }));

import { normalizeCspReports } from "@/lib/security/csp-reports";

/**
 * The one thing this genuinely has to get right: a violation report shaped
 * either way a browser might send it (the legacy report-uri POST, or the
 * modern Reporting API's array) has to come out the other side with the
 * fields that actually matter, and anything unexpected must not throw --
 * a report a future browser shapes slightly differently should still be
 * recorded via `raw`, not lost to a parsing error.
 */
describe("normalizeCspReports", () => {
  it("reads the legacy report-uri shape", () => {
    const body = { "csp-report": {
      "document-uri": "https://kinesis.test/goals",
      "violated-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/x.js",
      disposition: "report",
    } };

    expect(normalizeCspReports(body, "application/csp-report")).toEqual([{
      documentUri: "https://kinesis.test/goals",
      violatedDirective: "script-src-elem",
      blockedUri: "https://evil.example/x.js",
      disposition: "report",
      raw: body,
    }]);
  });

  it("reads the modern Reporting API shape, a batch at a time", () => {
    const body = [
      { type: "csp-violation", url: "https://kinesis.test/todos", body: {
        documentURL: "https://kinesis.test/todos", effectiveDirective: "style-src-attr", blockedURL: "inline", disposition: "report",
      } },
      { type: "csp-violation", url: "https://kinesis.test/documents", body: {
        documentURL: "https://kinesis.test/documents", effectiveDirective: "img-src", blockedURL: "https://evil.example/y.png", disposition: "enforce",
      } },
    ];

    const reports = normalizeCspReports(body, "application/reports+json");

    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ documentUri: "https://kinesis.test/todos", violatedDirective: "style-src-attr", blockedUri: "inline", disposition: "report" });
    expect(reports[1]).toMatchObject({ documentUri: "https://kinesis.test/documents", violatedDirective: "img-src", blockedUri: "https://evil.example/y.png", disposition: "enforce" });
  });

  it("falls back to the report's own url when documentURL is absent", () => {
    const body = [{ type: "csp-violation", url: "https://kinesis.test/finance", body: {} }];

    expect(normalizeCspReports(body, "application/reports+json")).toEqual([expect.objectContaining({ documentUri: "https://kinesis.test/finance" })]);
  });

  it("returns nothing for a body that doesn't carry a report, rather than throwing", () => {
    expect(normalizeCspReports({}, "application/csp-report")).toEqual([]);
    expect(normalizeCspReports(null, "application/csp-report")).toEqual([]);
    expect(normalizeCspReports("not an object", "application/csp-report")).toEqual([]);
    expect(normalizeCspReports({ unrelated: true }, "application/reports+json")).toEqual([]);
    expect(normalizeCspReports(null, "application/reports+json")).toEqual([]);
  });

  it("tolerates a malformed entry inside an otherwise valid batch", () => {
    const body = ["not an object", { type: "csp-violation", url: "https://kinesis.test/goals", body: { blockedURL: "https://evil.example" } }];

    const reports = normalizeCspReports(body, "application/reports+json");

    expect(reports).toHaveLength(2);
    expect(reports[1]).toMatchObject({ blockedUri: "https://evil.example" });
  });
});
