import { prisma } from "./prisma";

export async function getDocuments() {
  return prisma.document.findMany({
    orderBy: {
      name: "asc",
    },
  });
}

export async function getDocument(id: string) {
  return prisma.document.findUnique({
    where: {
      id,
    },
  });
}

export async function createDocument(data: {
  id: string;
  name: string;
  type: string;
  status: string;
}) {
  return prisma.document.create({
    data,
  });
}


export async function updateDocument(
  id: string,
  data: Partial<{
    name: string;
    type: string;
    status: string;
  }>
) {
  return prisma.document.update({
    where: { id },
    data,
  });
}

export async function deleteDocument(id: string) {
  return prisma.document.delete({
    where: { id },
  });
}