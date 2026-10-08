"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Clock3, ExternalLink, LayoutTemplate, LoaderCircle, Pencil, Repeat2, Save, X } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { completeRecurringOccurrenceAction, promoteFieldToTemplateAction, updateCustomItemAction, type CustomItemState } from "../../../actions";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import { KinesisLinkCard } from "@/components/custom-fields/KinesisLinkCard";
import { TemplateFieldValues, type TemplateFieldValue } from "@/components/custom-fields/TemplateFieldValues";
import type { CustomFieldType, CustomFieldValue, KinesisLinkOption, NumberFieldFormat } from "@/lib/custom-fields/types";
import type { KinesisLinkPreviewStat, KinesisLinkRecentEvent } from "@/lib/data/kinesis-links";
import { KinesisLinks } from "@/components/kinesis-links/KinesisLinks";
import type { KinesisLink } from "@/lib/data/object-relationships";
import type { KinesisLinkActionState } from "@/app/actions";
import { differenceInCalendarDays, formatDate, formatDeadline, parseDateOnly } from "@/lib/dates";
import { followingOccurrence, recurrenceLabel, type Recurrence } from "@/lib/custom-modules/recurrence";
import { useToday } from "@/lib/format/context";
import { Snackbar } from "@/components/ui/Snackbar";
import { formatMoney, formatPercent } from "@/lib/format/numbers";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";
import { freshestStamp } from "@/lib/actions/concurrency";
import { SaveConflictNotice } from "@/components/ui/SaveConflictNotice";
import { keepFormValues } from "@/components/ui/keep-form-values";

const initialState: CustomItemState = {};
const EMPTY_VALUE = "—";
/**
 * A field's name on the read view -- small caps in a mid grey, the same
 * label treatment the Document page gives its Expiry/Reminder fields, so
 * each name reads as a label rather than fading into the page.
 */
const FIELD_LABEL_CLASS = "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500";

type EditableItem = {
  id: string; name: string; archived: boolean;
  templateId: string | null; templateFields: TemplateFieldValue[]; fields: CustomFieldValue[];
  updatedAt: string;
};

/**
 * The item detail page's own read/edit toggle, the same shape
 * `DocumentDetailRecord` already gives Documents: a plain read view by
 * default, with an "Edit" button that swaps in the save form -- rather than
 * the form being the only way this page ever looked, editable the moment you
 * opened it.
 */
export function CustomItemDetailRecord({ moduleId, item, moduleName, description, moduleIcon, moduleColor, linkOptions, previews, recentEvents, locale, currency, deleteAction, kinesisLinks, addKinesisLinkAction, updateKinesisLinkAction, removeKinesisLinkAction }: {
  moduleId: string;
  item: EditableItem;
  moduleName: string;
  /** The Created/Updated line, shown under the item's name the way a Document shows its own Added date. */
  description: React.ReactNode;
  moduleIcon: string;
  moduleColor: string;
  linkOptions: KinesisLinkOption[];
  previews: Record<string, KinesisLinkPreviewStat[]>;
  recentEvents: Record<string, KinesisLinkRecentEvent>;
  locale: string;
  currency: string;
  deleteAction: React.ReactNode;
  kinesisLinks: KinesisLink[];
  addKinesisLinkAction: (state: KinesisLinkActionState, data: FormData) => Promise<KinesisLinkActionState>;
  updateKinesisLinkAction: (linkId: string, data: FormData) => Promise<void>;
  removeKinesisLinkAction: (linkId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  // `item` is a server-fed prop, refreshed only once `router.refresh()`
  // lands after a save -- and `onSaved` below closes the form synchronously,
  // before that refresh completes. Without tracking the save's own returned
  // stamp here, a quick reopen of Edit in that window would hand the form
  // back `item.updatedAt` from before the save, and its very next save
  // would refuse itself as a conflict against its own prior write.
  const [savedUpdatedAt, setSavedUpdatedAt] = useState<string | null>(null);
  const updatedAt = freshestStamp(item.updatedAt, savedUpdatedAt ?? undefined);

  return <>
    <ModuleHeader
      backHref={`/custom-modules/${moduleId}`}
      backLabel={`Back to ${moduleName}`}
      breadcrumbs={[{ label: moduleName, href: `/custom-modules/${moduleId}` }, { label: item.name }]}
      title={item.name}
      description={description}
      icon={<CustomModuleIcon name={moduleIcon} className="h-6 w-6"/>}
      iconClassName="text-zinc-700"
      iconStyle={{ backgroundColor: `color-mix(in srgb, ${moduleColor} 10%, white)` }}
      actions={<>{!editing && <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"><Pencil className="h-4 w-4" />Edit</button>}{deleteAction}</>}
    />
    <section className="mt-6 sm:mt-8 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      {editing
        ? <EditForm moduleId={moduleId} item={item} updatedAt={updatedAt} linkOptions={linkOptions} previews={previews} addKinesisLinkAction={addKinesisLinkAction} kinesisLinks={kinesisLinks} updateKinesisLinkAction={updateKinesisLinkAction} removeKinesisLinkAction={removeKinesisLinkAction} onCancel={() => setEditing(false)} onSaved={(newUpdatedAt) => { setSavedUpdatedAt(newUpdatedAt); setEditing(false); }} />
        : <ReadView moduleId={moduleId} moduleName={moduleName} moduleIcon={moduleIcon} item={item} linkOptions={linkOptions} previews={previews} recentEvents={recentEvents} locale={locale} currency={currency} kinesisLinks={kinesisLinks} updateKinesisLinkAction={updateKinesisLinkAction} removeKinesisLinkAction={removeKinesisLinkAction} />}
    </section>
  </>;
}

type DisplayField = { key: string; label: string; type?: CustomFieldType; value: string; targetObjectIds?: string[]; isDueDate?: boolean; isRecurringDueDate?: boolean; recurrence?: Recurrence | null; multiline?: boolean; numberFormat?: NumberFieldFormat };

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

function ReadView({ moduleId, moduleName, moduleIcon, item, linkOptions, previews, recentEvents, locale, currency, kinesisLinks, updateKinesisLinkAction, removeKinesisLinkAction }: {
  moduleId: string; moduleName: string; moduleIcon: string; item: EditableItem; linkOptions: KinesisLinkOption[]; previews: Record<string, KinesisLinkPreviewStat[]>; recentEvents: Record<string, KinesisLinkRecentEvent>; locale: string; currency: string;
  kinesisLinks: KinesisLink[];
  updateKinesisLinkAction: (linkId: string, data: FormData) => Promise<void>;
  removeKinesisLinkAction: (linkId: string) => Promise<void>;
}) {
  const fields: DisplayField[] = [
    ...item.templateFields.map((field) => ({ key: `t:${field.templateFieldId}`, label: field.label, type: field.type, value: field.value, targetObjectIds: field.targetObjectIds, isDueDate: field.isDueDate, isRecurringDueDate: field.isRecurringDueDate, recurrence: field.recurrence, multiline: field.multiline, numberFormat: field.numberFormat })),
    ...item.fields.map((field) => ({ key: `f:${field.id ?? field.label}`, label: field.label, type: field.type, value: field.value, targetObjectIds: field.targetObjectIds })),
  ];
  const metadataFields = fields.filter((field) => field.type !== "KINESIS_LINK");
  // KD-050: a Kinesis Link *Custom Field* only survives here as a template
  // field's value now -- "Add custom field" no longer creates an ad-hoc one
  // (see CustomFieldsEditor), so item.fields never carries type
  // KINESIS_LINK going forward. A field keeps its row here even once every
  // target it pointed at is gone -- the field itself survives that (see
  // FieldLink's cascade), and hiding it left the person with no way to know
  // it was still there, blocking an unrelated save the moment they opened
  // Edit.
  const linkedFields = item.templateFields.flatMap((field) => {
    if (field.type !== "KINESIS_LINK") return [];
    const options = (field.targetObjectIds ?? []).flatMap((id) => linkOptions.find((option) => option.objectId === id) ?? []);
    return [{ key: `t:${field.templateFieldId}`, label: field.label, options }];
  });

  // Opens with "[Module] information", the same heading a Document's own
  // page opens its details card with ("Document information").
  const heading = <div className="flex items-center gap-2"><CustomModuleIcon name={moduleIcon} className="h-5 w-5 text-zinc-400" /><h2 className="text-lg font-semibold text-zinc-900">{moduleName} information</h2></div>;

  if (!fields.length && !kinesisLinks.length) return <div className="space-y-5">{heading}<p className="text-sm text-zinc-400">No details added yet.</p></div>;

  return <div className="space-y-6">
    {heading}
    {metadataFields.length > 0 && <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {metadataFields.map((field) => field.isRecurringDueDate ? (
        <div key={field.key} className="sm:col-span-2 lg:col-span-3">
          <dt className={FIELD_LABEL_CLASS}><Repeat2 className="h-3 w-3" />{field.label}</dt>
          <dd className="mt-1.5 text-sm font-medium text-zinc-700"><RecurringDueDateValue moduleId={moduleId} itemId={item.id} archived={item.archived} value={field.value} recurrence={field.recurrence ?? null} locale={locale} /></dd>
        </div>
      ) : <div key={field.key} className={field.multiline ? "sm:col-span-2 lg:col-span-3" : ""}>
        <dt className={FIELD_LABEL_CLASS}>{field.isDueDate && <Clock3 className="h-3 w-3" />}{field.label}</dt>
        <dd className={`mt-1.5 text-sm font-medium text-zinc-900 ${field.multiline ? "whitespace-pre-wrap break-words" : "break-words"}`}>
          {field.type === "LINK" && field.value
            ? <a href={field.value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">{field.value}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
            : displayValue(field, locale, currency)}
        </dd>
      </div>)}
    </dl>}
    {linkedFields.length > 0 && <div className={`grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))] ${metadataFields.length > 0 ? "border-t border-zinc-100 pt-6" : ""}`}>
      {linkedFields.map(({ key, label, options }) => <div key={key} className="min-w-0 space-y-2">
        <h3 className={`mb-2 truncate ${FIELD_LABEL_CLASS}`}>{label}</h3>
        {options.length ? options.map((option) => <KinesisLinkCard key={option.objectId} option={option} stats={previews[option.objectId] ?? []} recentEvent={recentEvents[option.objectId]} />) : <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-400">Linked item no longer available</p>}
      </div>)}
    </div>}
    {kinesisLinks.length > 0 && (
      <div className={`${metadataFields.length > 0 || linkedFields.length > 0 ? "border-t border-zinc-100 pt-6" : ""}`}>
        <KinesisLinks links={kinesisLinks} previews={previews} recentEvents={recentEvents} updateAction={updateKinesisLinkAction} removeAction={removeKinesisLinkAction} />
      </div>
    )}
  </div>;
}

/**
 * A Recurring Due Date's read view (KD-055): a small tick box, the current
 * occurrence's date, its rule, how far off it is, and the occurrence after
 * it. Ticking completes the current occurrence (`completeRecurringOccurrenceAction`)
 * and confirms with a snackbar; History records it. Laid out as a plain
 * field rather than a boxed panel, so it never reads as a Kinesis Link card.
 * No tick box while archived -- archiving pauses the schedule (Decision 9).
 */
function RecurringDueDateValue({ moduleId, itemId, archived, value, recurrence, locale }: { moduleId: string; itemId: string; archived: boolean; value: string; recurrence: Recurrence | null; locale: string }) {
  const router = useRouter();
  const today = useToday();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const dueDate = value ? parseDateOnly(value) : null;

  if (!dueDate || !recurrence) return <>{EMPTY_VALUE}</>;

  const days = differenceInCalendarDays(dueDate, today);
  const status = formatDeadline(dueDate, today);
  const statusClass = days < 0 ? "text-red-600" : days === 0 ? "text-amber-700" : "text-zinc-500";
  const complete = () => {
    setError(null);
    startTransition(async () => {
      const result = await completeRecurringOccurrenceAction(moduleId, itemId, value);
      if (result.error) {
        setError(result.error);
        if (result.conflict) router.refresh();
        return;
      }
      if (result.nextDueDate) setToast({ id: Date.now(), message: `Done. Next due ${formatDate(result.nextDueDate, locale)}.` });
      router.refresh();
    });
  };

  return <>
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {!archived && (
        <button type="button" onClick={complete} disabled={pending} aria-label="Mark this occurrence done" title="Mark this occurrence done" className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-wait">
          <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 transition ${pending ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400 bg-white hover:border-zinc-600"}`}>
            {pending && <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3.5} />}
          </span>
        </button>
      )}
      <span className="font-semibold text-zinc-900">{formatDate(dueDate, locale)}</span>
      <span aria-hidden="true" className="text-zinc-300">·</span>
      <span>{recurrenceLabel(recurrence)}</span>
      <span aria-hidden="true" className="text-zinc-300">·</span>
      <span className={`font-semibold ${statusClass}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
    </div>
    <p className="mt-1 text-xs font-normal text-zinc-500">Next event: {formatDate(followingOccurrence(dueDate, recurrence), locale)}</p>
    {error && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    {toast && <Snackbar key={toast.id} message={toast.message} onDismiss={() => setToast(null)} />}
  </>;
}

function EditForm({ moduleId, item, updatedAt, linkOptions, previews, addKinesisLinkAction, kinesisLinks, updateKinesisLinkAction, removeKinesisLinkAction, onCancel, onSaved }: { moduleId: string; item: EditableItem; updatedAt: string; linkOptions: KinesisLinkOption[]; previews: Record<string, KinesisLinkPreviewStat[]>; addKinesisLinkAction: (state: KinesisLinkActionState, data: FormData) => Promise<KinesisLinkActionState>; kinesisLinks: KinesisLink[]; updateKinesisLinkAction: (linkId: string, data: FormData) => Promise<void>; removeKinesisLinkAction: (linkId: string) => Promise<void>; onCancel: () => void; onSaved: (updatedAt: string) => void }) {
  const [archived, setArchived] = useState(item.archived);
  const router = useRouter();
  // The action reports both halves of the outcome -- `pending` while it runs,
  // `saved` once it has -- so there is no separate save-state machine here to
  // keep in step with it.
  const [state, formAction, pending] = useActionState(updateCustomItemAction.bind(null, moduleId, item.id), initialState);

  useEffect(() => { if (state.saved && state.updatedAt) { router.refresh(); onSaved(state.updatedAt); } }, [state.saved, state.updatedAt, router, onSaved]);

  return <form autoComplete="off" spellCheck={false} action={formAction} ref={keepFormValues} className="space-y-5">
    <input type="hidden" name="updatedAt" value={updatedAt} />
    <label className="block text-sm font-medium text-zinc-600">Name<input required name="name" maxLength={100} defaultValue={item.name} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    {item.templateFields.length > 0 && <div className="border-t border-zinc-100 pt-5"><TemplateFieldValues fields={item.templateFields} linkOptions={linkOptions} previews={previews} /></div>}
    <div className="border-t border-zinc-100 pt-5">
      <CustomFieldsEditor initialFields={item.fields} linkOptions={linkOptions} previews={previews} addKinesisLinkAction={addKinesisLinkAction} kinesisLinks={kinesisLinks} updateKinesisLinkAction={updateKinesisLinkAction} removeKinesisLinkAction={removeKinesisLinkAction} />
      {item.templateId && item.fields.length > 0 && <PromoteFields moduleId={moduleId} itemId={item.id} fields={item.fields} />}
    </div>
    <div className="flex justify-end"><button type="button" aria-pressed={archived} onClick={() => setArchived((current) => !current)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${archived ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{archived ? "Archived" : "Not Archived"}</button><input type="hidden" name="archived" value={String(archived)}/></div>
    {state.error && (state.conflict ? <SaveConflictNotice message={state.error} /> : <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>)}
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
