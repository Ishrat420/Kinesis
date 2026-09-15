import type { Prisma } from "@prisma/client";
import type { prisma } from "./prisma";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * The one template a brand-new Kinesis deployment gets for free, so a
 * casual first-time owner has something to build a Custom Module from
 * without first learning how templates work. Generic on purpose -- a due
 * date, a link out, a link to another Kinesis object, and a notes field
 * cover most things worth recording.
 *
 * Called only from `requireKinesisUser`'s genuine first-provisioning branch
 * (lib/auth.ts), with that transaction's own client, so it either seeds this
 * template as part of that very first commit or not at all -- never for an
 * existing owner being rotated onto a new Clerk identity, who already has
 * their own templates (or has deliberately deleted this one). Kept in its
 * own module, importing neither `lib/auth` nor `lib/data/templates` (which
 * itself imports `lib/auth`), so that security-sensitive first-provisioning
 * code never sits in an import cycle.
 */
export async function createStarterTemplate(client: Client, userId: string) {
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
