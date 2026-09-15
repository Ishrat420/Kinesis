import type { Prisma } from "@prisma/client";
import type { prisma } from "./prisma";

type Client = Prisma.TransactionClient | typeof prisma;

/** The starter template's name -- also its identity for `ensureStarterTemplate`'s own idempotency check, since nothing else marks a template as "the one Kinesis seeded." */
const STARTER_TEMPLATE_NAME = "General Record";

/**
 * The one template every Kinesis owner gets for free, so a casual owner --
 * new or already using the app before this shipped -- has something to
 * build a Custom Module from without first learning how templates work.
 * Generic on purpose -- a due date, a link out, a link to another Kinesis
 * object, and a notes field cover most things worth recording.
 *
 * Idempotent on "this owner already has a template named General Record",
 * not on "this owner has any template at all" -- an owner who had already
 * created their own templates before this existed (the common case for a
 * single-owner deployment, ADR-014, that predates this feature) must still
 * get this one; checking for *any* template would skip them forever. The
 * one cost is that renaming this specific template makes it look absent
 * again, bringing a second one back on the next request -- an acceptable
 * trade for a deployment that only ever has one owner, and far simpler
 * than a permanent "already seeded" marker for a case this narrow.
 *
 * Called from every branch of `requireKinesisUser` that returns an owner
 * (lib/auth.ts), with that call's own client -- the transaction's `tx`
 * inside first-time provisioning, plain `prisma` everywhere else. Kept in
 * its own module, importing neither `lib/auth` nor `lib/data/templates`
 * (which itself imports `lib/auth`), so that security-sensitive
 * provisioning code never sits in an import cycle.
 */
export async function ensureStarterTemplate(client: Client, userId: string) {
  const existing = await client.template.findFirst({ where: { userId, name: STARTER_TEMPLATE_NAME }, select: { id: true } });
  if (existing) return;

  await client.template.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      name: STARTER_TEMPLATE_NAME,
      fields: {
        create: [
          { id: crypto.randomUUID(), label: "Due date", type: "DATE", position: 0, isDueDate: true },
          { id: crypto.randomUUID(), label: "Reference", type: "LINK", position: 1 },
          { id: crypto.randomUUID(), label: "Related", type: "KINESIS_LINK", position: 2 },
          { id: crypto.randomUUID(), label: "Notes", type: "TEXT", position: 3, multiline: true },
        ],
      },
    },
  });
}
