"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cloneTemplate, createTemplate, deleteTemplate, updateTemplate } from "@/lib/data/templates";
import { parseTemplateFields } from "@/lib/templates/parse";
import { refusalOf } from "@/lib/actions/refusal";

export type TemplateActionState = { error?: string; saved?: boolean };

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** "New template" opens straight into the detail screen -- no separate creation form to fill in first. */
export async function createTemplateAction() {
  const template = await createTemplate();
  revalidatePath("/settings/templates");
  redirect(`/settings/templates/${template.id}`);
}

export async function updateTemplateAction(templateId: string, _previousState: TemplateActionState, data: FormData): Promise<TemplateActionState> {
  const name = text(data, "name");
  if (!name) return { error: "Enter a template name." };
  const form = parseTemplateFields(data);
  if (!form.ok) return { error: form.error };

  try {
    await updateTemplate(templateId, name, form.fields);
  } catch (failure) {
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  revalidatePath("/settings/templates");
  revalidatePath(`/settings/templates/${templateId}`);
  return { saved: true };
}

export async function cloneTemplateAction(templateId: string, _previousState: TemplateActionState, data: FormData): Promise<TemplateActionState> {
  const name = text(data, "name");
  if (!name) return { error: "Enter a name for the copy." };

  let clone;
  try {
    clone = await cloneTemplate(templateId, name);
  } catch (failure) {
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  revalidatePath("/settings/templates");
  redirect(`/settings/templates/${clone.id}`);
}

export async function deleteTemplateAction(templateId: string): Promise<TemplateActionState> {
  try {
    await deleteTemplate(templateId);
  } catch (failure) {
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  revalidatePath("/settings/templates");
  redirect("/settings/templates");
}
