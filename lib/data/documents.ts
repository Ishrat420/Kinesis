import { prisma } from "./prisma";
import { getExpiryDetails } from "@/lib/documents/expiry";
import { DEFAULT_DOCUMENT_TYPES, formatDocumentType, isDefaultDocumentType } from "@/lib/documents/types";
import { getCurrentUser, getUserDisplayName } from "./user";

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
  customFields?: Array<{ label: string; value: string }>;
};

export async function getDocuments() {
  return prisma.document.findMany({ orderBy: { name: "asc" } });
}

export async function getDocumentSummary() {
  const documents = await prisma.document.findMany({
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

export async function getDocumentTypes() {
  const [customTypes, usedTypes] = await Promise.all([
    prisma.documentType.findMany({ orderBy: { name: "asc" } }),
    prisma.document.findMany({ distinct: ["type"], select: { type: true } }),
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
  const formatted = formatDocumentType(value);
  if (!formatted || isDefaultDocumentType(formatted)) return formatted;
  const existing = await prisma.documentType.findFirst({
    where: { name: { equals: formatted, mode: "insensitive" } },
  });
  if (existing) return existing.name;
  await prisma.documentType.create({ data: { id: crypto.randomUUID(), name: formatted } });
  return formatted;
}

export async function deleteUnusedDocumentType(name: string) {
  if (isDefaultDocumentType(name)) return { error: "Default document types cannot be deleted." };
  const inUse = await prisma.document.count({ where: { type: { equals: name, mode: "insensitive" } } });
  if (inUse) return { error: "This type is being used by a document." };
  await prisma.documentType.deleteMany({ where: { name: { equals: name, mode: "insensitive" } } });
  return {};
}

export async function getDocument(id: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    include: { customFields: { orderBy: { position: "asc" } } },
  });
  if (!document) return null;
  const status = getExpiryDetails(document.expiryDate, document.prompt).status;
  if (status !== document.status) {
    return prisma.document.update({
      where: { id },
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
      owner: getUserDisplayName(user),
      customFields: {
        create: customFields.map((field, position) => ({
          id: crypto.randomUUID(),
          ...field,
          position,
        })),
      },
    },
  });
}

export async function updateDocument(id: string, data: DocumentInput) {
  const { customFields = [], ...document } = data;
  return prisma.$transaction(async (transaction) => {
    await transaction.documentField.deleteMany({ where: { documentId: id } });
    await transaction.notification.deleteMany({ where: { documentId: id } });
    return transaction.document.update({
      where: { id },
      data: {
        ...document,
        customFields: {
          create: customFields.map((field, position) => ({
            id: crypto.randomUUID(),
            ...field,
            position,
          })),
        },
      },
    });
  });
}

export async function deleteDocument(id: string) {
  return prisma.document.delete({ where: { id } });
}
