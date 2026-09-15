import type { Prisma } from "@prisma/client";
import type { prisma } from "./prisma";

type Client = Prisma.TransactionClient | typeof prisma;

/** The starter template's initial name -- a label the owner is free to change, never its identity. See `isStarter` below. */
const STARTER_TEMPLATE_NAME = "General Record";

/**
 * The one template every Kinesis owner gets for free, so a casual owner --
 * new or already using the app before this shipped -- has something to
 * build a Custom Module from without first learning how templates work.
 * Generic on purpose -- a due date, a link out, a link to another Kinesis
 * object, and a notes field cover most things worth recording.
 *
 * Idempotent on the `isStarter` column, not on "this owner has any template
 * at all" (an owner who had already created their own templates before this
 * existed -- the common case for a single-owner deployment, ADR-014, that
 * predates this feature -- must still get this one) and not on matching the
 * name "General Record" either (the owner renaming their own template is
 * expected and must not make it look absent and bring back a second one).
 * `isStarter` is the one thing neither of those can disturb.
 *
 * Called from every branch of `requireKinesisUser` that returns an owner
 * (lib/auth.ts), with that call's own client -- the transaction's `tx`
 * inside first-time provisioning, plain `prisma` everywhere else. Kept in
 * its own module, importing neither `lib/auth` nor `lib/data/templates`
 * (which itself imports `lib/auth`), so that security-sensitive
 * provisioning code never sits in an import cycle.
 */
export async function ensureStarterTemplate(client: Client, userId: string) {
  const existing = await client.template.findFirst({ where: { userId, isStarter: true }, select: { id: true } });
  if (existing) return;

  await client.template.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      name: STARTER_TEMPLATE_NAME,
      isStarter: true,
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
