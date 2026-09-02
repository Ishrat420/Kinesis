import type { KinesisObjectType, Prisma } from "@prisma/client";
import type { prisma } from "./prisma";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Object is the identity a typed record is created with, so it is always written
 * as part of that record's own create. `name` seeds the row; from then on the
 * database keeps it in step with the record (see the 20260902000000 migration),
 * which is why nothing here offers a way to rename an object on its own. Since
 * 20260903000000 that is enforced rather than assumed: a direct write to
 * Object.name that disagrees with the typed record is rejected.
 */
const identity = (type: KinesisObjectType, name: string, userId: string) => ({ create: { type, name, userId } });

/**
 * One entry per typed model, so Object.type cannot drift from what it names.
 * 20260903000000 backs this with triggers, so a mismatched attachment is
 * refused by the database even if a caller bypasses this factory.
 */
export const objectFor = {
  document: (name: string, userId: string) => identity("DOCUMENT", name, userId),
  goal: (name: string, userId: string) => identity("GOAL", name, userId),
  financeItem: (name: string, userId: string) => identity("FINANCE_ITEM", name, userId),
  person: (name: string, userId: string) => identity("PERSON", name, userId),
  customItem: (name: string, userId: string) => identity("CUSTOM_ITEM", name, userId),
};

/**
 * Deleting the identity deletes the typed record with it, and takes every shared
 * capability hanging off the object — relationships, inbound links — with it too.
 * Ownership stays in the statement so a delete can never widen past its owner.
 */
export const deleteObjects = (client: Client, objectIds: string[], userId: string) =>
  client.object.deleteMany({ where: { id: { in: objectIds }, userId } });
