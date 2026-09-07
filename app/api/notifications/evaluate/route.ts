import { evaluateNotifications } from "@/lib/data/notifications";

/**
 * The daily pass. It no longer reconciles notifications -- those are derived
 * when the bell is read -- so what is left is archiving goals whose target date
 * has passed, which is a real write and the one thing that should not wait for
 * someone to open the app.
 */

async function evaluate(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron authentication is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await evaluateNotifications());
}

export const GET = evaluate;
export const POST = evaluate;
