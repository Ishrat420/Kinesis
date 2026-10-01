import { timingSafeEqual } from "node:crypto";
import { runDailyPush } from "@/lib/data/push";

/**
 * The daily Web Push run (KD-053), called by Vercel Cron (see vercel.json).
 *
 * There is no signed-in user here, so proxy.ts lets this path past Clerk and
 * the request is authenticated by `CRON_SECRET` instead: Vercel sends it as a
 * bearer token on every cron call. With no secret configured, the route
 * refuses everything rather than running open.
 */
function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  const summary = await runDailyPush();
  if (!summary.configured) return Response.json({ error: "Web Push is not configured." }, { status: 503 });
  return Response.json(summary);
}
