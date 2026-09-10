import { after } from "next/server";
import { normalizeCspReports, recordCspViolationReports } from "@/lib/security/csp-reports";

/**
 * Where the CSP header in next.config.ts finally has somewhere to send
 * violation reports -- see that file for why this needed to exist at all.
 *
 * Unauthenticated by necessity: a violation report has no session to attach
 * (it can even arrive from the sign-in page, before Clerk resolves), so this
 * can't be gated behind Kinesis auth the way every other route here is.
 *
 * Answers before it writes anything: the database write happens in `after`,
 * so a slow write is never on the path the reporting browser is waiting on,
 * and it can never slow down a real page load either -- nothing here runs
 * unless a violation actually fires.
 */
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("csp-report") && !contentType.includes("reports+json")) {
    return new Response(null, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const reports = normalizeCspReports(body, contentType);
  if (reports.length) {
    after(async () => {
      try {
        await recordCspViolationReports(reports);
      } catch (error) {
        console.error("Failed to persist a CSP violation report", error);
      }
    });
  }

  return new Response(null, { status: 204 });
}
