import { prisma } from "./prisma";
import { getExpiryDetails } from "@/lib/documents/expiry";
import { DEFAULT_DOCUMENT_TYPES, formatDocumentType, isDefaultDocumentType } from "@/lib/documents/types";
import { getCurrentUser, getUserDisplayName } from "./user";
import { connection } from "next/server";
import { requireKinesisUser } from "@/lib/auth";
import type { CustomFieldValue } from "@/lib/custom-fields/types";

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
  const documents = await prisma.document.findMany({
    where: { userId: user.id },
    select: { expiryDate: true, prompt: true },
  });

  const statuses = documents.map(
    ({ expiryDate, prompt }) => getExpiryDetails(expiryDate, prompt).status,
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
  const documents = await prisma.document.findMany({
    where: { userId: user.id, expiryDate: { not: null } },
    orderBy: { expiryDate: "asc" },
  });

  const upcoming = documents.filter(
    (document) => getExpiryDetails(document.expiryDate, document.prompt, now).status === "Expiring soon",
  );
  const expired = documents
    .filter((document) => getExpiryDetails(document.expiryDate, document.prompt, now).status === "Expired")
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

export async function resolveDocumentType(value: string) {
  const user = await requireKinesisUser();
  const formatted = formatDocumentType(value);
  if (!formatted || isDefaultDocumentType(formatted)) return formatted;
  const existing = await prisma.documentType.findFirst({
    where: { userId: user.id, name: { equals: formatted, mode: "insensitive" } },
  });
  if (existing) return existing.name;
  await prisma.documentType.create({ data: { id: crypto.randomUUID(), userId: user.id, name: formatted } });
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

export async function getDocument(id: string) {
  const user = await requireKinesisUser();
  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: { customFields: { orderBy: { position: "asc" } } },
  });
  if (!document) return null;
  const status = getExpiryDetails(document.expiryDate, document.prompt).status;
  if (status !== document.status) {
    return prisma.document.update({
      where: { id, userId: user.id },
      data: { status },
      include: { customFields: { orderBy: { position: "asc" } } },
    });
  }
  return document;
}

export async function createDocument(data: DocumentInput & { id?: string }) {
  const user = await getCurrentUser();
  const { customFields = [], ...document } = data;
  return prisma.document.create({
    data: {
      ...document,
      id: data.id ?? crypto.randomUUID(),
      user: { connect: { id: user.id } },
      object: { create: { type: "DOCUMENT" as const, name: document.name, userId: user.id } },
      owner: getUserDisplayName(user),
      customFields: {
        create: customFields.map(({ id: fieldId, ...field }, position) => ({
          ...field,
          id: fieldId ?? crypto.randomUUID(),
          position,
        })),
      },
    },
  });
}

export async function updateDocument(id: string, data: DocumentInput) {
  const user = await requireKinesisUser();
  const { customFields = [], ...document } = data;
  return prisma.$transaction(async (transaction) => {
    const owned = await transaction.document.findFirst({ where: { id, userId: user.id }, select: { id: true, objectId: true } });
    if (!owned) throw new Error("Document not found");
    const existingFields = await transaction.documentField.findMany({ where: { documentId: id }, select: { id: true, type: true } });
    const existingTypes = new Map(existingFields.map((field) => [field.id, field.type]));
    if (customFields.some((field) => field.id && existingTypes.has(field.id) && existingTypes.get(field.id) !== (field.type ?? "TEXT"))) throw new Error("A custom field's type cannot be changed");
    await transaction.documentField.deleteMany({ where: { documentId: id } });
    await transaction.notification.deleteMany({ where: { documentId: id, userId: user.id } });
    await transaction.object.update({ where: { id: owned.objectId }, data: { name: document.name } });
    return transaction.document.update({
      where: { id },
      data: {
        ...document,
        customFields: {
          create: customFields.map(({ id: fieldId, ...field }, position) => ({
            ...field,
            id: fieldId ?? crypto.randomUUID(),
            position,
          })),
        },
      },
    });
  });
}

export async function deleteDocument(id: string) {
  const user = await requireKinesisUser();
  const document = await prisma.document.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (!document) return { count: 0 };
  await prisma.object.delete({ where: { id: document.objectId } });
  return { count: 1 };
}
