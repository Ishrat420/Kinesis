import type { FieldLink, ObjectField } from "@prisma/client";
import { prisma } from "./prisma";
import { getDocumentState, getExpiryDetails } from "@/lib/documents/expiry";
import { DEFAULT_DOCUMENT_TYPES, formatDocumentType, isDefaultDocumentType } from "@/lib/documents/types";
import { getCurrentUser, getUserDisplayName } from "./user";
import { connection } from "next/server";
import { requireKinesisUser } from "@/lib/auth";
import type { CustomFieldValue } from "@/lib/custom-fields/types";
import { prepareCustomFields } from "@/lib/custom-fields/parse";
import { presentCustomFields } from "@/lib/custom-fields/present";
import { deleteObjects, objectFor } from "./objects";
import { refuse, refuseConflict } from "@/lib/actions/refusal";
import { getToday } from "@/lib/format/server";

export type DocumentInput = {
  name: string;
  type: string;
  status: string;
  expiryDate?: Date | null;
  issueDate?: Date | null;
  documentNumber?: string | null;
  country?: string | null;
  notes?: string | null;
  link?: string | null;
  prompt?: number;
  archived?: boolean;
  expiryDateLabel?: string;
  issueDateLabel?: string;
  documentNumberLabel?: string;
  countryLabel?: string;
  notesLabel?: string;
  linkLabel?: string;
  customFields?: CustomFieldValue[];
};

export async function getDocuments() {
  const user = await requireKinesisUser();
  return prisma.document.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
}

export async function getDocumentSummary() {
  const user = await requireKinesisUser();
  // Archived documents are out of the cycle, so they are not tracked, active,
  // or expiring: counting them here would keep a document the person has
  // finished with in the dashboard's numbers forever.
  const documents = await prisma.document.findMany({
    where: { userId: user.id, archived: false },
    select: { expiryDate: true, prompt: true },
  });

  const today = await getToday();
  const statuses = documents.map(
    ({ expiryDate, prompt }) => getExpiryDetails(expiryDate, prompt, today).status,
  );

  return {
    tracked: documents.length,
    active: statuses.filter((status) => status === "Active").length,
    expiringSoon: statuses.filter((status) => status === "Expiring soon").length,
  };
}

export async function getExpiringDocuments(now = new Date()) {
  await connection();
  const user = await requireKinesisUser();
  const today = await getToday(now);
  const documents = await prisma.document.findMany({
    where: { userId: user.id, archived: false, expiryDate: { not: null } },
    orderBy: { expiryDate: "asc" },
  });

  const upcoming = documents.filter(
    (document) => getExpiryDetails(document.expiryDate, document.prompt, today).status === "Expiring soon",
  );
  const expired = documents
    .filter((document) => getExpiryDetails(document.expiryDate, document.prompt, today).status === "Expired")
    .reverse();

  return { upcoming, expired };
}

export async function getDocumentTypes() {
  const user = await requireKinesisUser();
  const [customTypes, usedTypes] = await Promise.all([
    prisma.documentType.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.document.findMany({ where: { userId: user.id }, distinct: ["type"], select: { type: true } }),
  ]);
  const used = new Set(usedTypes.map(({ type }) => type.toLocaleLowerCase()));
  const names = new Map<string, { name: string; isDefault: boolean; inUse: boolean }>();

  for (const name of DEFAULT_DOCUMENT_TYPES) names.set(name.toLocaleLowerCase(), { name, isDefault: true, inUse: used.has(name.toLocaleLowerCase()) });
  for (const { name } of customTypes) names.set(name.toLocaleLowerCase(), { name, isDefault: false, inUse: used.has(name.toLocaleLowerCase()) });
  for (const { type } of usedTypes) {
    const name = formatDocumentType(type);
    if (!names.has(name.toLocaleLowerCase())) names.set(name.toLocaleLowerCase(), { name, isDefault: false, inUse: true });
  }

  return [...names.values()];
}

/**
 * Same bug as `ensureStarterTemplate` (lib/data/starter-template.ts): the
 * find-then-create below is unlocked, so two saves racing on a brand-new
 * custom type from two tabs can both miss the `findFirst` and both reach
 * `create`, and the loser hits `DocumentType`'s `@@unique([userId, name])`
 * constraint. Caught here the same way, rather than left to crash that
 * save -- the winner already created the row this call would have, so the
 * only thing left to do is read back whichever casing won and use that,
 * for the same reason the ordinary hit above returns `existing.name`
 * rather than `formatted`.
 */
export async function resolveDocumentType(value: string) {
  const user = await requireKinesisUser();
  const formatted = formatDocumentType(value);
  if (!formatted || isDefaultDocumentType(formatted)) return formatted;
  const existing = await prisma.documentType.findFirst({
    where: { userId: user.id, name: { equals: formatted, mode: "insensitive" } },
  });
  if (existing) return existing.name;
  try {
    await prisma.documentType.create({ data: { id: crypto.randomUUID(), userId: user.id, name: formatted } });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const winner = await prisma.documentType.findFirst({ where: { userId: user.id, name: { equals: formatted, mode: "insensitive" } } });
      return winner?.name ?? formatted;
    }
    throw error;
  }
  return formatted;
}

export async function deleteUnusedDocumentType(name: string) {
  const user = await requireKinesisUser();
  if (isDefaultDocumentType(name)) return { error: "Default document types cannot be deleted." };
  const inUse = await prisma.document.count({ where: { userId: user.id, type: { equals: name, mode: "insensitive" } } });
  if (inUse) return { error: "This type is being used by a document." };
  await prisma.documentType.deleteMany({ where: { userId: user.id, name: { equals: name, mode: "insensitive" } } });
  return {};
}

/** A document's own fields, off the shared `ObjectField` table, in display order, with each field's Kinesis Link targets in the order they were added. */
const documentFieldsInclude = {
  object: { select: { fields: { orderBy: { position: "asc" as const }, include: { links: { orderBy: { position: "asc" as const } } } } } },
};

/** Presents a document the way every caller of this file already expects: `customFields` as its own flat array. */
function withCustomFields<T extends { object: { fields: (ObjectField & { links: FieldLink[] })[] } }>({ object, ...document }: T) {
  return { ...document, customFields: presentCustomFields(object.fields) };
}

export async function getDocument(id: string) {
  const user = await requireKinesisUser();
  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: documentFieldsInclude,
  });
  if (!document) return null;
  const status = getDocumentState(document, await getToday()).status;
  if (status !== document.status) {
    return prisma.document.update({
      where: { id, userId: user.id },
      data: { status },
      include: documentFieldsInclude,
    }).then(withCustomFields);
  }
  return withCustomFields(document);
}

export async function createDocument(data: DocumentInput & { id?: string }) {
  const user = await getCurrentUser();
  const { customFields = [], ...document } = data;
  const fields = prepareCustomFields(customFields);
  return prisma.document.create({
    data: {
      ...document,
      id: data.id ?? crypto.randomUUID(),
      user: { connect: { id: user.id } },
      object: objectFor.document(document.name, user.id, fields),
      owner: getUserDisplayName(user),
    },
  });
}

/**
 * `expectedUpdatedAt` is the `updatedAt` the caller last read this document
 * at (BUG-007): the write below is conditioned on the row still carrying
 * that exact stamp, so a save from a stale tab is refused instead of
 * silently overwriting whatever changed the document in between. Required,
 * not optional, so no call site -- present or future -- can skip it by
 * omission the way an optional parameter invites.
 */
export async function updateDocument(id: string, data: DocumentInput, expectedUpdatedAt: Date) {
  const user = await requireKinesisUser();
  const { customFields = [], ...document } = data;
  return prisma.$transaction(async (transaction) => {
    const owned = await transaction.document.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
    if (!owned) refuse("This document no longer exists.");
    const existingFields = await transaction.objectField.findMany({ where: { objectId: owned.objectId }, select: { id: true, type: true } });
    const existingTypes = new Map(existingFields.map((field) => [field.id, field.type]));
    if (customFields.some((field) => field.id && existingTypes.has(field.id) && existingTypes.get(field.id) !== (field.type ?? "TEXT"))) refuse("A custom field's type cannot be changed once it has been saved.");

    // A plain `update()` can't be conditioned on `updatedAt` and still carry
    // this document's own nested field write -- only `updateMany` accepts a
    // `WHERE` clause here, and it can't do nested relational writes. So the
    // version check runs first, alone, as its own atomic statement; the
    // object-fields rewrite below only runs once that has proven the row is
    // still the one the caller read.
    const result = await transaction.document.updateMany({
      where: { id, userId: user.id, updatedAt: expectedUpdatedAt },
      data: document,
    });
    if (result.count === 0) {
      const stillExists = await transaction.document.findFirst({ where: { id, userId: user.id }, select: { id: true } });
      if (!stillExists) refuse("This document no longer exists.");
      refuseConflict("This document was changed elsewhere. Reload to see the latest version before saving again.");
    }

    // Nothing to clear: the document's notifications are derived from it, and
    // whether they have been read is keyed on the deadline rather than on any
    // of the fields being written here. Deleting the old rows was what handed
    // back an already-read reminder every time a document was renamed.
    await transaction.objectField.deleteMany({ where: { objectId: owned.objectId } });
    await transaction.object.update({
      where: { id: owned.objectId },
      data: { fields: { create: prepareCustomFields(customFields) } },
    });

    return transaction.document.findUniqueOrThrow({ where: { id } });
  });
}

export async function deleteDocument(id: string) {
  const user = await requireKinesisUser();
  const document = await prisma.document.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (!document) return { count: 0 };
  return deleteObjects(prisma, [document.objectId], user.id);
}
