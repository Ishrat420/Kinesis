import { prisma } from "./prisma";

export type DocumentInput = {
  name: string;
  type: string;
  status: string;
  expiryDate?: Date | null;
  issueDate?: Date | null;
  documentNumber?: string | null;
  country?: string | null;
  notes?: string | null;
  expiryDateLabel?: string;
  issueDateLabel?: string;
  documentNumberLabel?: string;
  countryLabel?: string;
  notesLabel?: string;
  customFields?: Array<{ label: string; value: string }>;
};

export async function getDocuments() {
  return prisma.document.findMany({ orderBy: { name: "asc" } });
}

export async function getDocument(id: string) {
  return prisma.document.findUnique({
    where: { id },
    include: { customFields: { orderBy: { position: "asc" } } },
  });
}

export async function createDocument(data: DocumentInput & { id?: string }) {
  const { customFields = [], ...document } = data;
  return prisma.document.create({
    data: {
      ...document,
      id: data.id ?? crypto.randomUUID(),
      owner: "user",
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
