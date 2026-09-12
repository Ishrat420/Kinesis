"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, ExternalLink, LayoutTemplate, LoaderCircle, Pencil, Save, X } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { promoteFieldToTemplateAction, updateCustomItemAction, type CustomItemState } from "../../../actions";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import { KinesisLinkCard } from "@/components/custom-fields/KinesisLinkCard";
import { TemplateFieldValues, type TemplateFieldValue } from "@/components/custom-fields/TemplateFieldValues";
import type { CustomFieldType, CustomFieldValue, KinesisLinkOption, NumberFieldFormat } from "@/lib/custom-fields/types";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format/numbers";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";

const initialState: CustomItemState = {};
const EMPTY_VALUE = "—";

type EditableItem = {
  id: string; name: string; archived: boolean;
  templateId: string | null; templateFields: TemplateFieldValue[]; fields: CustomFieldValue[];
};

/**
 * The item detail page's own read/edit toggle, the same shape
 * `DocumentDetailRecord` already gives Documents: a plain read view by
 * default, with an "Edit" button that swaps in the save form -- rather than
 * the form being the only way this page ever looked, editable the moment you
 * opened it.
 */
export function CustomItemDetailRecord({ moduleId, item, moduleName, moduleIcon, moduleColor, linkOptions, locale, currency, deleteAction }: {
  moduleId: string;
  item: EditableItem;
  moduleName: string;
  moduleIcon: string;
  moduleColor: string;
  linkOptions: KinesisLinkOption[];
  locale: string;
  currency: string;
  deleteAction: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return <>
    <ModuleHeader
      backHref={`/custom-modules/${moduleId}`}
      backLabel={`Back to ${moduleName}`}
      breadcrumbs={[{ label: moduleName, href: `/custom-modules/${moduleId}` }, { label: item.name }]}
      title={item.name}
      icon={<CustomModuleIcon name={moduleIcon} className="h-6 w-6"/>}
      iconClassName="text-zinc-700"
      iconStyle={{ backgroundColor: `color-mix(in srgb, ${moduleColor} 10%, white)` }}
      actions={<>{!editing && <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"><Pencil className="h-4 w-4" />Edit</button>}{deleteAction}</>}
    />
    <section className="mt-8 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      {editing
        ? <EditForm moduleId={moduleId} item={item} linkOptions={linkOptions} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
        : <ReadView item={item} linkOptions={linkOptions} locale={locale} currency={currency} />}
    </section>
  </>;
}

type DisplayField = { key: string; label: string; type?: CustomFieldType; value: string; targetObjectIds?: string[]; isDueDate?: boolean; multiline?: boolean; numberFormat?: NumberFieldFormat };

function displayValue(field: DisplayField, locale: string, currency: string) {
  if (!field.value) return EMPTY_VALUE;
  if (field.type === "DATE") {
    const date = parseDatedFieldValue(field.value);
    return date ? formatDate(date, locale) : field.value;
  }
  if (field.type === "CHECKBOX") return field.value === "true" ? "Yes" : "No";
  if (field.type === "NUMBER" && field.numberFormat) {
    const amount = Number(field.value);
    if (Number.isFinite(amount)) return field.numberFormat === "CURRENCY" ? formatMoney(amount, locale, currency) : formatPercent(amount, locale);
  }
  return field.value;
}

function ReadView({ item, linkOptions, locale, currency }: { item: EditableItem; linkOptions: KinesisLinkOption[]; locale: string; currency: string }) {
  const fields: DisplayField[] = [
    ...item.templateFields.map((field) => ({ key: `t:${field.templateFieldId}`, label: field.label, type: field.type, value: field.value, targetObjectIds: field.targetObjectIds, isDueDate: field.isDueDate, multiline: field.multiline, numberFormat: field.numberFormat })),
    ...item.fields.map((field) => ({ key: `f:${field.id ?? field.label}`, label: field.label, type: field.type, value: field.value, targetObjectIds: field.targetObjectIds })),
  ];
  const metadataFields = fields.filter((field) => field.type !== "KINESIS_LINK");
  // A field keeps its row here even once every target it pointed at is gone
  // -- the field itself survives that (see FieldLink's cascade), and hiding it
  // left the person with no way to know it was still there, blocking an
  // unrelated save the moment they opened Edit.
  const linkedFields = fields.flatMap((field) => {
    if (field.type !== "KINESIS_LINK") return [];
    const options = (field.targetObjectIds ?? []).flatMap((id) => linkOptions.find((option) => option.objectId === id) ?? []);
    return [{ field, options }];
  });

  if (!fields.length) return <p className="text-sm text-zinc-400">No details added yet.</p>;

  return <div className="space-y-6">
    {metadataFields.length > 0 && <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {metadataFields.map((field) => <div key={field.key} className={field.multiline ? "sm:col-span-2 lg:col-span-3" : ""}>
        <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">{field.isDueDate && <Clock3 className="h-3 w-3" />}{field.label}</dt>
        <dd className={`mt-1 text-sm font-medium text-zinc-700 ${field.multiline ? "whitespace-pre-wrap break-words" : "break-words"}`}>
          {field.type === "LINK" && field.value
            ? <a href={field.value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">{field.value}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
            : displayValue(field, locale, currency)}
        </dd>
      </div>)}
    </dl>}
    {linkedFields.length > 0 && <div className={`grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))] ${metadataFields.length > 0 ? "border-t border-zinc-100 pt-6" : ""}`}>
      {linkedFields.map(({ field, options }) => <div key={field.key} className="min-w-0 space-y-2">
        <h3 className="mb-2 truncate text-xs font-medium text-zinc-500">{field.label}</h3>
        {options.length ? options.map((option) => <KinesisLinkCard key={option.objectId} option={option} />) : <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-400">Linked item no longer available</p>}
      </div>)}
    </div>}
  </div>;
}

function EditForm({ moduleId, item, linkOptions, onCancel, onSaved }: { moduleId: string; item: EditableItem; linkOptions: KinesisLinkOption[]; onCancel: () => void; onSaved: () => void }) {
  const [archived, setArchived] = useState(item.archived);
  const router = useRouter();
  // The action reports both halves of the outcome -- `pending` while it runs,
  // `saved` once it has -- so there is no separate save-state machine here to
  // keep in step with it.
  const [state, formAction, pending] = useActionState(updateCustomItemAction.bind(null, moduleId, item.id), initialState);

  useEffect(() => { if (state.saved) { router.refresh(); onSaved(); } }, [state.saved, router, onSaved]);

  return <form action={formAction} className="space-y-5">
    <label className="block text-sm font-medium text-zinc-600">Name<input required name="name" maxLength={100} defaultValue={item.name} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    {item.templateFields.length > 0 && <div className="border-t border-zinc-100 pt-5"><TemplateFieldValues fields={item.templateFields} linkOptions={linkOptions} /></div>}
    <div className="border-t border-zinc-100 pt-5">
      <CustomFieldsEditor initialFields={item.fields} linkOptions={linkOptions} />
      {item.templateId && item.fields.length > 0 && <PromoteFields moduleId={moduleId} itemId={item.id} fields={item.fields} />}
    </div>
    <div className="flex justify-end"><button type="button" aria-pressed={archived} onClick={() => setArchived((current) => !current)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${archived ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{archived ? "Archived" : "Not Archived"}</button><input type="hidden" name="archived" value={String(archived)}/></div>
    {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
    <div className="flex justify-end gap-2 border-t border-zinc-100 pt-5">
      <button type="button" onClick={onCancel} disabled={pending} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"><X className="h-4 w-4" />Cancel</button>
      <button disabled={pending} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-wait disabled:opacity-70">{pending ? <LoaderCircle className="h-4 w-4 animate-spin"/> : state.saved ? <CheckCircle2 className="h-4 w-4"/> : <Save className="h-4 w-4"/>}{pending ? "Saving…" : state.saved ? "Saved" : "Save changes"}</button>
    </div>
  </form>;
}

/**
 * Turns one of this item's own fields into a real field on the template it
 * follows (KD-035 Decision 4) -- a standalone action, not part of the form's
 * own save, since it changes the template itself and every other object
 * under it, not just this one.
 */
function PromoteFields({ moduleId, itemId, fields }: { moduleId: string; itemId: string; fields: CustomFieldValue[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const promote = (fieldId: string) => {
    setPendingId(fieldId);
    setError(null);
    startTransition(async () => {
      const result = await promoteFieldToTemplateAction(moduleId, itemId, fieldId);
      if (result.error) setError(result.error);
      else router.refresh();
      setPendingId(null);
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-400">Add to template:</span>
      {fields.flatMap((field) => field.id ? [
        <button
          key={field.id}
          type="button"
          disabled={isPending}
          onClick={() => promote(field.id!)}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
        >
          {pendingId === field.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <LayoutTemplate className="h-3 w-3" />}
          {field.label}
        </button>,
      ] : [])}
      {error && <span role="alert" className="w-full text-xs font-medium text-red-600">{error}</span>}
    </div>
  );
}
