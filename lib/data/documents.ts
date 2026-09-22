import type { FieldLink, ObjectField, Prisma } from "@prisma/client";
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
import { documentUpcomingPhase } from "@/lib/attention/items";
import { diffObjectFields, recordArchivedChanged, recordEvent, recordFieldChanges, recordStatusChanged, type FieldChange } from "./object-events";
import { formatDateInput } from "@/lib/dates";

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

/**
 * KD-017 Phase 2: classification now goes through the shared
 * `documentUpcomingPhase` (Phase 1) rather than its own copy of the same
 * boundary math -- there was no disagreement to fix here (documents are the
 * one type every surface already agreed on), just one fewer place the rule
 * is written down.
 *
 * `remindersEnabled` is deliberately always passed as `true`: this tile and
 * its "see all" page are the one surface ADR-010 documents as ignoring that
 * setting entirely (line 40, "never been argued... maybe revisited later").
 * Preserved as-is, not part of this pass. Dismissal-awareness is likewise
 * deliberately not added here -- unlike Needs Attention/Upcoming & Due, this
 * is a reference listing, not a "what needs me right now" surface, and
 * whether a dismissed-elsewhere document should still count here is a
 * product decision of its own, not a side effect of this migration.
 */
export async function getExpiringDocuments(now = new Date()) {
  await connection();
  const user = await requireKinesisUser();
  const today = await getToday(now);
  const documents = await prisma.document.findMany({
    where: { userId: user.id, archived: false, expiryDate: { not: null } },
    orderBy: { expiryDate: "asc" },
  });

  const phase = (document: (typeof documents)[number]) =>
    documentUpcomingPhase({ kind: "document", id: document.id, name: document.name, type: document.type, expiryDate: document.expiryDate!, prompt: document.prompt }, today, true);

  const upcoming = documents.filter((document) => phase(document) === "due-soon");
  const expired = documents.filter((document) => phase(document) === "overdue").reverse();

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

/**
 * A Document's computed `status` just moved -- ordinarily a generic
 * STATUS_CHANGED line, except landing specifically on "Expiring soon",
 * which gets its own named moment (`DOCUMENT_EXPIRING_SOON`) instead, the
 * same way `GOAL_COMPLETED` gets its own type rather than a generic
 * "Finished" status line. `expiryDate` is the document's *current* one, so
 * the line can say when -- both call sites below already have it in hand,
 * whether from the row just read or the save that's about to write it.
 */
async function recordDocumentStatusChange(tx: Prisma.TransactionClient, userId: string, objectId: string, oldStatus: string, newStatus: string, expiryDate: Date | null, source: "USER" | "SYSTEM") {
  if (newStatus === "Expiring soon") {
    await recordEvent(tx, userId, objectId, "DOCUMENT_EXPIRING_SOON", undefined, expiryDate ? formatDateInput(expiryDate) : undefined, source);
  } else {
    await recordStatusChanged(tx, userId, objectId, oldStatus, newStatus, source);
  }
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
    return prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id, userId: user.id },
        data: { status },
        include: documentFieldsInclude,
      });
      // Nobody took an action here -- the status just crossed a boundary
      // (expiry) between one page view and the next -- so this is SYSTEM,
      // not USER.
      await recordDocumentStatusChange(tx, user.id, document.objectId, document.status, status, document.expiryDate, "SYSTEM");
      return updated;
    }).then(withCustomFields);
  }
  return withCustomFields(document);
}

export async function createDocument(data: DocumentInput & { id?: string }) {
  const user = await getCurrentUser();
  const { customFields = [], ...document } = data;
  const fields = prepareCustomFields(customFields);
  return prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        ...document,
        id: data.id ?? crypto.randomUUID(),
        user: { connect: { id: user.id } },
        object: objectFor.document(document.name, user.id, fields),
        owner: getUserDisplayName(user),
      },
    });
    await recordEvent(tx, user.id, created.objectId, "ITEM_CREATED");
    return created;
  });
}

/** The Document columns a save can change and that are worth their own History line -- everything `DocumentInput` accepts except `status`/`archived` (each has its own named event below) and the `*Label` fields, which name a field rather than hold a value. */
const NAMED_FIELDS = [
  ["name", "Name"], ["expiryDate", "Expiry date"], ["issueDate", "Issue date"], ["documentNumber", "Document number"],
  ["country", "Country"], ["notes", "Notes"], ["link", "Link"], ["prompt", "Reminder"],
] as const satisfies readonly (readonly [keyof DocumentInput, string])[];

/** A `DocumentInput` column's value, formatted the same plain way every other stored value in this model is -- a date as `yyyy-mm-dd`, everything else as-is. */
function columnValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return formatDateInput(value);
  return String(value);
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
    const owned = await transaction.document.findFirst({
      where: { id, userId: user.id },
      select: { objectId: true, status: true, archived: true, name: true, expiryDate: true, issueDate: true, documentNumber: true, country: true, notes: true, link: true, prompt: true },
    });
    if (!owned) refuse("This document no longer exists.");
    const existingFields = await transaction.objectField.findMany({ where: { objectId: owned.objectId }, select: { id: true, type: true, label: true, value: true } });
    const existingTypes = new Map(existingFields.map((field) => [field.id, field.type]));
    if (customFields.some((field) => field.id && existingTypes.has(field.id) && existingTypes.get(field.id) !== (field.type ?? "TEXT"))) refuse("A custom field's type cannot be changed once it has been saved.");
    // The picker never offers this document as its own link target, but a
    // stale tab or a direct request could still submit one.
    if (customFields.some((field) => field.targetObjectIds?.includes(owned.objectId))) refuse("A document can't be linked to itself.");

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
    const newFields = prepareCustomFields(customFields);
    await transaction.object.update({
      where: { id: owned.objectId },
      data: { fields: { create: newFields } },
    });

    // `archived` gets its own named event (ITEM_ARCHIVED/RESTORED), not a
    // generic FIELD_CHANGED line -- it already has one in the enum, shared
    // with Custom Items, and reads better on its own than "archived changed:
    // false -> true."
    if (data.archived !== undefined && data.archived !== owned.archived) {
      await recordArchivedChanged(transaction, user.id, owned.objectId, data.archived);
    }
    // `status` is recomputed by the caller (`getDocumentState`) as a side
    // effect of whatever else changed on this save (a new expiry date, an
    // archive toggle) -- still worth its own line when it actually moves,
    // independently of whichever field caused it.
    if (data.status !== owned.status) {
      await recordDocumentStatusChange(transaction, user.id, owned.objectId, owned.status, data.status, document.expiryDate ?? null, "USER");
    }
    const namedChanges: FieldChange[] = NAMED_FIELDS
      .filter(([key]) => columnValue(owned[key]) !== columnValue(document[key]))
      .map(([key, label]) => ({ fieldKey: key, fieldLabel: label, oldValue: columnValue(owned[key]), newValue: columnValue(document[key]) }));
    await recordFieldChanges(transaction, user.id, owned.objectId, namedChanges);
    await recordFieldChanges(transaction, user.id, owned.objectId, diffObjectFields(existingFields, newFields));

    return transaction.document.findUniqueOrThrow({ where: { id } });
  });
}

export async function deleteDocument(id: string) {
  const user = await requireKinesisUser();
  const document = await prisma.document.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (!document) return { count: 0 };
  return deleteObjects(prisma, [document.objectId], user.id);
}
