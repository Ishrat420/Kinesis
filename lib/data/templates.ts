import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { refuse } from "@/lib/actions/refusal";
import type { TemplateFieldInput } from "@/lib/templates/parse";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Whether any object currently follows this template -- the single gate for
 * every destructive template operation (KD-035 Decision 7): deleting the
 * template outright, changing a field's type, removing a field. All three
 * read this one fact rather than three separate checks.
 *
 * Takes the current transaction client where there is one, so a check made
 * mid-write sees the same snapshot the write itself does.
 */
async function isTemplateInUse(client: Client, templateId: string): Promise<boolean> {
  const count = await client.object.count({ where: { templateId } });
  return count > 0;
}

export async function getTemplates() {
  const user = await requireKinesisUser();
  const templates = await prisma.template.findMany({
    where: { userId: user.id },
    include: { _count: { select: { fields: true, customModules: true, objects: true } } },
    orderBy: { createdAt: "asc" },
  });
  return templates.map(({ _count, ...template }) => ({
    ...template,
    fieldCount: _count.fields,
    linkedModules: _count.customModules,
    usedByObjects: _count.objects,
  }));
}

export async function getTemplate(id: string) {
  const user = await requireKinesisUser();
  const template = await prisma.template.findFirst({
    where: { id, userId: user.id },
    include: {
      fields: { orderBy: { position: "asc" } },
      _count: { select: { customModules: true, objects: true } },
    },
  });
  if (!template) return null;
  const { _count, ...rest } = template;
  return { ...rest, inUse: _count.objects > 0, linkedModules: _count.customModules, usedByObjects: _count.objects };
}

/** The templates a module could start new items from -- just enough to populate that picker. */
export async function getTemplateOptions() {
  const user = await requireKinesisUser();
  return prisma.template.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

/**
 * The template's one Due Date field, if it has one (KD-038) -- read by the
 * item-creation dialog to decide whether to show its own fixed Due Date
 * input (no template due-date field) or hand that job to the template's own
 * field instead (there is one, even before that field is fillable at
 * creation time -- see KD-039).
 */
export async function getTemplateDueDateFieldId(templateId: string) {
  const field = await prisma.templateField.findFirst({ where: { templateId, isDueDate: true }, select: { id: true } });
  return field?.id ?? null;
}

export async function createTemplate() {
  const user = await requireKinesisUser();
  return prisma.template.create({ data: { id: crypto.randomUUID(), userId: user.id, name: "Untitled template" } });
}

/**
 * Saves a template's name and field list in one go.
 *
 * A field's `id` stays stable across the save: an existing field is updated
 * in place, never dropped and recreated, because a later phase has objects
 * store values against a field's id directly (KD-035 Decision 1/7) --
 * recreating it here would silently orphan every object's stored value the
 * moment someone renamed or reordered a field. Only fields genuinely absent
 * from the submitted list are deleted, and only once confirmed safe to.
 */
export async function updateTemplate(templateId: string, name: string, fields: TemplateFieldInput[]) {
  const user = await requireKinesisUser();
  return prisma.$transaction(async (tx) => {
    const owned = await tx.template.findFirst({ where: { id: templateId, userId: user.id }, select: { id: true } });
    if (!owned) refuse("This template no longer exists.");

    const existing = await tx.templateField.findMany({ where: { templateId }, select: { id: true, type: true, isDueDate: true } });
    const existingById = new Map(existing.map((field) => [field.id, field]));
    const submittedIds = new Set(fields.flatMap(({ id }) => id ? [id] : []));
    const removedIds = existing.filter(({ id }) => !submittedIds.has(id)).map(({ id }) => id);
    const typeChanged = fields.some(({ id, type }) => id && existingById.has(id) && existingById.get(id)!.type !== type);

    if ((removedIds.length || typeChanged) && await isTemplateInUse(tx, templateId)) {
      refuse("This template is in use, so its fields can no longer be retyped or removed.");
    }

    // A field's Due Date status is not a type change -- it has no UI path
    // to change at all (KD-038 Decision 1), unconditionally, whether or not
    // the template is in use. A stray or tampered payload is the only way
    // this could ever fire.
    if (fields.some(({ id, isDueDate }) => id && existingById.has(id) && Boolean(existingById.get(id)!.isDueDate) !== Boolean(isDueDate))) {
      refuse("A field can't be turned into or out of the Due Date field.");
    }
    if (fields.filter(({ isDueDate }) => isDueDate).length > 1) {
      refuse("A template can only have one Due Date field.");
    }

    await tx.template.update({ where: { id: templateId }, data: { name } });
    if (removedIds.length) await tx.templateField.deleteMany({ where: { id: { in: removedIds } } });
    for (const [position, field] of fields.entries()) {
      const existingField = field.id ? existingById.get(field.id) : undefined;
      if (existingField) {
        await tx.templateField.update({ where: { id: existingField.id }, data: { label: field.label, type: field.type, position } });
      } else {
        await tx.templateField.create({ data: { id: crypto.randomUUID(), templateId, label: field.label, type: field.type, position, isDueDate: Boolean(field.isDueDate) } });
      }
    }
  });
}

export async function cloneTemplate(templateId: string, name: string) {
  const user = await requireKinesisUser();
  const source = await prisma.template.findFirst({
    where: { id: templateId, userId: user.id },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!source) refuse("This template no longer exists.");

  return prisma.template.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      fields: {
        create: source.fields.map(({ label, type, position, isDueDate }) => ({ id: crypto.randomUUID(), label, type, position, isDueDate })),
      },
    },
  });
}

export async function deleteTemplate(templateId: string) {
  const user = await requireKinesisUser();
  const owned = await prisma.template.findFirst({ where: { id: templateId, userId: user.id }, select: { id: true } });
  if (!owned) return;
  if (await isTemplateInUse(prisma, templateId)) refuse("This template is in use and cannot be deleted.");
  await prisma.template.delete({ where: { id: templateId } });
}
