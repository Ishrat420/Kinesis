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
 *
 * `fields` is accepted here, not on the typed record's own create, because
 * ObjectField hangs off the identity rather than off Document or CustomItem
 * directly (see the 20260915000000 migration) -- a document and its custom
 * fields are created in one nested write by nesting the fields one level
 * deeper still, under the object this factory already builds.
 */
const identity = (type: KinesisObjectType, name: string, userId: string, fields?: Prisma.ObjectFieldCreateWithoutObjectInput[]) => ({
  create: { type, name, userId, ...(fields?.length ? { fields: { create: fields } } : {}) },
});

/**
 * One entry per typed model, so Object.type cannot drift from what it names.
 * 20260903000000 backs this with triggers, so a mismatched attachment is
 * refused by the database even if a caller bypasses this factory.
 */
export const objectFor = {
  document: (name: string, userId: string, fields?: Prisma.ObjectFieldCreateWithoutObjectInput[]) => identity("DOCUMENT", name, userId, fields),
  goal: (name: string, userId: string) => identity("GOAL", name, userId),
  financeItem: (name: string, userId: string) => identity("FINANCE_ITEM", name, userId),
  person: (name: string, userId: string) => identity("PERSON", name, userId),
  customItem: (name: string, userId: string, fields?: Prisma.ObjectFieldCreateWithoutObjectInput[]) => identity("CUSTOM_ITEM", name, userId, fields),
  todo: (name: string, userId: string) => identity("TODO", name, userId),
};

/**
 * Deleting the identity deletes the typed record with it, and takes every shared
 * capability hanging off the object — relationships, inbound links — with it too.
 * Ownership stays in the statement so a delete can never widen past its owner.
 */
export const deleteObjects = (client: Client, objectIds: string[], userId: string) =>
  client.object.deleteMany({ where: { id: { in: objectIds }, userId } });
