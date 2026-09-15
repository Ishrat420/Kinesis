import type { Prisma } from "@prisma/client";
import type { prisma } from "./prisma";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * The one template every Kinesis owner gets for free, so a casual owner --
 * new or already using the app before this shipped -- has something to
 * build a Custom Module from without first learning how templates work.
 * Generic on purpose -- a due date, a link out, a link to another Kinesis
 * object, and a notes field cover most things worth recording.
 *
 * Idempotent on "this owner currently has zero templates", not on a
 * one-time flag: that is what lets it also backfill an owner who was
 * already provisioned before this existed, the common case for a
 * single-owner deployment (ADR-014) that predates this feature, not just
 * genuine first-time signup. The one cost is that deleting this template
 * down to zero templates again brings it back on the next request -- an
 * acceptable trade for a deployment that only ever has one owner, and far
 * simpler than a permanent "already seeded" marker for a case this narrow.
 *
 * Called from every branch of `requireKinesisUser` that returns an owner
 * (lib/auth.ts), with that call's own client -- the transaction's `tx`
 * inside first-time provisioning, plain `prisma` everywhere else. Kept in
 * its own module, importing neither `lib/auth` nor `lib/data/templates`
 * (which itself imports `lib/auth`), so that security-sensitive
 * provisioning code never sits in an import cycle.
 */
export async function ensureStarterTemplate(client: Client, userId: string) {
  const count = await client.template.count({ where: { userId } });
  if (count > 0) return;

  await client.template.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      name: "General Record",
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
