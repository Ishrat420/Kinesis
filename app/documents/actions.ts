"use server";

import { createDocument } from "@/lib/data/documents";
import { redirect } from "next/navigation";

export type CreateDocumentState = {
  error?: string;
};

export async function createDocumentAction(
  _previousState: CreateDocumentState,
  formData: FormData,
): Promise<CreateDocumentState> {
  const name = formData.get("name");
  const type = formData.get("type");
  const status = formData.get("status");

  if (
    typeof name !== "string" ||
    typeof type !== "string" ||
    typeof status !== "string" ||
    !name.trim() ||
    !type.trim() ||
    !status.trim()
  ) {
    return { error: "Name, type, and status are required." };
  }

  const document = await createDocument({
    name: name.trim(),
    type: type.trim(),
    status: status.trim(),
  });

  redirect(`/documents/${document.id}`);
}
