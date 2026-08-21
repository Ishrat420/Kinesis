import { evaluateNotifications } from "@/lib/data/notifications";

async function evaluate(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await evaluateNotifications());
}

export const GET = evaluate;
export const POST = evaluate;
