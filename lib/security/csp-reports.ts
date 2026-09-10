import "server-only";
import { prisma } from "@/lib/data/prisma";

/**
 * Browsers send a CSP violation in one of two shapes depending on which
 * mechanism reported it -- both are wired in next.config.ts so neither
 * browser is left unable to report at all.
 *
 * Legacy (`report-uri`, Content-Type: application/csp-report):
 *   { "csp-report": { "document-uri": ..., "violated-directive": ..., ... } }
 *
 * Modern (`report-to` + the Reporting API, Content-Type: application/reports+json):
 *   an array of Report objects, each with its violation under `.body`.
 */
export type NormalizedCspReport = {
  documentUri: string | null;
  violatedDirective: string | null;
  blockedUri: string | null;
  disposition: string | null;
  raw: unknown;
};

const asString = (value: unknown): string | null => typeof value === "string" ? value : null;
const asRecord = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

/**
 * Never throws: this reads whatever a browser sent, and a report shaped
 * unexpectedly (a future browser revision, a proxy that mangled it) should
 * be recorded via `raw` rather than lost to a parsing error.
 */
export function normalizeCspReports(body: unknown, contentType: string): NormalizedCspReport[] {
  if (contentType.includes("reports+json")) {
    if (!Array.isArray(body)) return [];
    return body.map((entry) => {
      const record = asRecord(entry);
      const reportBody = asRecord(record.body);
      return {
        documentUri: asString(reportBody.documentURL) ?? asString(record.url),
        violatedDirective: asString(reportBody.effectiveDirective) ?? asString(reportBody.violatedDirective),
        blockedUri: asString(reportBody.blockedURL),
        disposition: asString(reportBody.disposition),
        raw: entry,
      };
    });
  }

  const cspReport = asRecord(body)["csp-report"];
  if (!cspReport) return [];
  const report = asRecord(cspReport);
  return [{
    documentUri: asString(report["document-uri"]),
    violatedDirective: asString(report["violated-directive"]),
    blockedUri: asString(report["blocked-uri"]),
    disposition: asString(report.disposition),
    raw: body,
  }];
}

/**
 * The one place these actually get written. Called from `after()` in the
 * route handler, so a slow database is never something the reporting
 * browser waits on -- it already has its 204 by the time this runs.
 */
export async function recordCspViolationReports(reports: NormalizedCspReport[]): Promise<void> {
  for (const report of reports) {
    await prisma.cspViolationReport.create({ data: {
      documentUri: report.documentUri,
      violatedDirective: report.violatedDirective,
      blockedUri: report.blockedUri,
      disposition: report.disposition,
      raw: report.raw as object,
    } });
  }
}
