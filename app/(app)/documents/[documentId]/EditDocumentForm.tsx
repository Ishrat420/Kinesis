"use client";

import { CalendarDays, Clock3, ExternalLink, FileText, Pencil, Save, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { DocumentFields, type CustomField } from "../DocumentFields";
import { updateDocumentAction, type DocumentActionState } from "../actions";
import { getDocumentState, type ExpiryUrgency, REMINDER_OPTIONS } from "@/lib/documents/expiry";
import { DocumentTypeSelect, type DocumentTypeOption } from "../DocumentTypeSelect";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import { KinesisLinkCard } from "@/components/custom-fields/KinesisLinkCard";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";

const initialState: DocumentActionState = {};
const EMPTY_VALUE = "—";

export type DocumentHistoryEntry = { id: string; action: string; createdAt: string };

export type EditableDocument = {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  expiryDate: string;
  issueDate: string;
  documentNumber: string;
  country: string;
  notes: string;
  link: string;
  prompt: number;
  archived: boolean;
  expiryDateLabel: string;
  issueDateLabel: string;
  documentNumberLabel: string;
  countryLabel: string;
  notesLabel: string;
  linkLabel: string;
  customFields: CustomField[];
};

export function DocumentDetailRecord({ document, documentTypes, ownerName, linkOptions, history, initialEditing = false }: { document: EditableDocument; documentTypes: DocumentTypeOption[]; ownerName: string; linkOptions: KinesisLinkOption[]; history: DocumentHistoryEntry[]; initialEditing?: boolean }) {
  const [editing, setEditing] = useState(initialEditing);
  const expiry = getDocumentState({ expiryDate: toUtcDate(document.expiryDate), prompt: document.prompt, archived: document.archived });
  const statusClass = STATUS_TONES[expiry.urgency];
  const { locale } = useFormatPreferences();
  const addedDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(document.createdAt));

  return (
    <>
      <ModuleHeader
        className="mb-6"
        backHref="/documents"
        backLabel="Back to documents"
        breadcrumbs={[{ label: "Documents", href: "/documents" }, { label: document.name }]}
        title={document.name}
        description={<>{document.type} <span className="mx-1 text-zinc-300">|</span> Added {addedDate}</>}
        actions={<><span className={`rounded-full px-4 py-2 text-sm font-semibold ${statusClass}`}>{expiry.status}</span>{!editing && <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"><Pencil className="h-4 w-4" />Edit</button>}</>}
      />

      {editing ? (
        <EditForm document={document} documentTypes={documentTypes} ownerName={ownerName} linkOptions={linkOptions} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
      ) : (
        <ReadView document={document} ownerName={ownerName} expiryLabel={expiry.label} expiryUrgency={expiry.urgency} locale={locale} linkOptions={linkOptions} history={history} />
      )}
    </>
  );
}

function ReadView({ document, ownerName, expiryLabel, expiryUrgency, locale, linkOptions, history }: { document: EditableDocument; ownerName: string; expiryLabel: string; expiryUrgency: ExpiryUrgency; locale: string; linkOptions: KinesisLinkOption[]; history: DocumentHistoryEntry[] }) {
  const reminder = REMINDER_OPTIONS.find((option) => option.days === document.prompt)?.label ?? `${document.prompt} days`;
  const linkedFields = document.customFields.flatMap((field) => {
    if (field.type !== "KINESIS_LINK") return [];
    const option = linkOptions.find(({ objectId }) => objectId === field.targetObjectId);
    return option ? [{ field, option }] : [];
  });
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6">
        <div className="mb-5 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-zinc-400" /><h2 className="text-lg font-semibold text-zinc-900">Document information</h2></div>
        <div className="grid gap-3 md:grid-cols-2">
          <PromotedField label="Expiry" value={displayDate(document.expiryDate, locale)} detail={expiryLabel} detailTone={expiryUrgency} />
          <PromotedField label="Reminder" value={document.expiryDate ? `${reminder} before expiry` : EMPTY_VALUE} detail={document.expiryDate ? "Configured reminder" : "Add an expiry date to use reminders"} />
        </div>
        <dl className="mt-6 grid gap-x-8 gap-y-5 border-t border-zinc-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <Metadata label={document.issueDateLabel} value={displayDate(document.issueDate, locale)} />
          <Metadata label={document.documentNumberLabel} value={document.documentNumber} />
          <Metadata label="Document type" value={document.type} />
          <Metadata label={document.countryLabel} value={document.country} />
          <Metadata label="Owner" value={ownerName} />
          <Metadata label={document.linkLabel} value={document.link} link />
          {document.customFields.filter((field) => field.type !== "KINESIS_LINK").map((field) => <Metadata key={field.id ?? field.label} label={field.label} value={displayFieldValue(field, locale)} />)}
        </dl>
        {linkedFields.length > 0 && <div className="mt-6 grid gap-4 border-t border-zinc-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          {linkedFields.map(({ field, option }) => <div key={field.id ?? field.label} className="min-w-0">
            <h3 className="mb-2 truncate text-xs font-medium text-zinc-500">{field.label}</h3>
            <KinesisLinkCard option={option} />
          </div>
          )}
        </div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6">
          <h2 className="text-lg font-semibold">File / document location</h2>
          <div className="mt-4 flex min-h-32 items-center gap-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-400 shadow-sm"><FileText className="h-6 w-6" /></span>
            <div><p className="text-sm font-medium text-zinc-600">File has not been uploaded for this document</p>{document.link && <a href={document.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:underline">Open external location <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
          </div>
        </section>
        <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className={`mt-4 whitespace-pre-wrap text-sm leading-6 ${document.notes ? "text-zinc-700" : "text-zinc-400"}`}>{document.notes || "No notes added yet."}</p>
        </section>
      </div>

      <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6">
        <h2 className="text-lg font-semibold">History</h2>
        <div className="mt-4 space-y-4">
          {(history.length > 0 ? history : [{ id: "created", action: "Added", createdAt: document.createdAt }]).map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-zinc-300" />
              <div>
                <p className="text-sm font-medium text-zinc-700">{historyLabel(entry.action)}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{formatDate(entry.createdAt, locale)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function EditForm({ document, documentTypes, ownerName, linkOptions, onCancel, onSaved }: { document: EditableDocument; documentTypes: DocumentTypeOption[]; ownerName: string; linkOptions: KinesisLinkOption[]; onCancel: () => void; onSaved: () => void }) {
  const action = updateDocumentAction.bind(null, document.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [expiryDate, setExpiryDate] = useState(document.expiryDate);
  const [prompt, setPrompt] = useState(document.prompt);
  const [archived, setArchived] = useState(document.archived);
  const router = useRouter();
  const expiry = getDocumentState({ expiryDate: toUtcDate(expiryDate), prompt, archived });
  const urgencyClass = { neutral: "bg-zinc-50 text-zinc-600", safe: "bg-emerald-50 text-emerald-700", soon: "bg-amber-50 text-amber-700", expired: "bg-red-50 text-red-700", archived: "bg-zinc-200 text-zinc-700" }[expiry.urgency];

  useEffect(() => { if (state.success) { router.refresh(); onSaved(); } }, [state.success, router, onSaved]);

  return <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6"><form action={formAction} className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Document name" name="name" value={document.name} required /><DocumentTypeSelect types={documentTypes} defaultValue={document.type} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-zinc-600">Reminder<select name="prompt" defaultValue={document.prompt} onChange={(event) => setPrompt(Number(event.target.value))} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 outline-none focus:border-zinc-400">{REMINDER_OPTIONS.map((option) => <option key={option.days} value={option.days}>{option.label} before expiry</option>)}</select></label><div className="text-sm font-medium text-zinc-600">Time until expiry<div role="status" className={`mt-1.5 flex h-11 items-center gap-2 rounded-xl px-3 font-semibold ${urgencyClass}`}><Clock3 className="h-4 w-4" />{expiry.label}</div></div></div>
    <div className="border-t border-zinc-100 pt-5"><p className="mb-4 font-semibold text-zinc-800">Information</p><DocumentFields labels={{ expiryDate: document.expiryDateLabel, issueDate: document.issueDateLabel, documentNumber: document.documentNumberLabel, country: document.countryLabel, notes: document.notesLabel, link: document.linkLabel }} values={{ expiryDate: document.expiryDate, issueDate: document.issueDate, documentNumber: document.documentNumber, country: document.country, notes: document.notes, link: document.link }} initialCustomFields={document.customFields} onExpiryDateChange={setExpiryDate} linkOptions={linkOptions} /></div>
    <div className="flex justify-end"><button type="button" aria-pressed={archived} onClick={() => setArchived((current) => !current)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${archived ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{archived ? "Archived" : "Not archived"}</button><input type="hidden" name="archived" value={String(archived)} /></div>
    {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
    <div className="flex flex-col gap-4 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-zinc-500">Owner: <span className="font-medium text-zinc-700">{ownerName}</span></p><div className="flex gap-2"><button type="button" onClick={onCancel} disabled={pending} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"><X className="h-4 w-4" />Cancel</button><button disabled={pending} className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"><Save className="h-4 w-4" />{pending ? "Saving…" : "Save changes"}</button></div></div>
  </form></section>;
}

const STATUS_TONES: Record<ExpiryUrgency, string> = { neutral: "bg-zinc-100 text-zinc-700", safe: "bg-emerald-50 text-emerald-700", soon: "bg-amber-50 text-amber-700", expired: "bg-red-50 text-red-700", archived: "bg-zinc-200 text-zinc-700" };
/** The form holds a yyyy-mm-dd string; every date rule here reads whole UTC days. */
function toUtcDate(value: string) { return value ? new Date(`${value}T00:00:00.000Z`) : null; }
function displayDate(value: string, locale: string) { return value ? formatDate(value, locale) : EMPTY_VALUE; }
/** A DATE-type custom field's raw value may still be a legacy dd/mm/yyyy string, so it is parsed rather than formatted directly. */
function displayFieldValue(field: { type?: string; value: string }, locale: string) {
  if (field.type !== "DATE") return field.value;
  const date = parseDatedFieldValue(field.value);
  return date ? formatDate(date, locale) : field.value;
}
function historyLabel(action: string) { return action === "Added" ? "Document added" : action === "Updated" ? "Document updated" : `Document ${action.toLowerCase()}`; }
function PromotedField({ label, value, detail, detailTone }: { label: string; value: string; detail: string; detailTone?: ExpiryUrgency }) {
  const detailClass = detailTone ? {
    neutral: "bg-zinc-100 text-zinc-600",
    safe: "bg-emerald-50 text-emerald-700",
    soon: "bg-amber-50 text-amber-700",
    expired: "bg-red-50 text-red-700",
    archived: "bg-zinc-200 text-zinc-700",
  }[detailTone] : "text-zinc-500";
  return <div className="rounded-2xl bg-blue-50/50 p-4"><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</dt><dd className="mt-2 text-lg font-semibold text-zinc-900">{value}</dd><p className={`mt-1 inline-flex rounded-full text-sm ${detailTone ? `px-2.5 py-1 font-semibold ${detailClass}` : detailClass}`}>{detail}</p></div>;
}
function Metadata({ label, value, link = false }: { label: string; value?: string; link?: boolean }) { const shown = value || EMPTY_VALUE; return <div><dt className="text-xs font-medium text-zinc-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-zinc-700">{link && value ? <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">{value}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a> : shown}</dd></div>; }
function Field({ label, name, value, required }: { label: string; name: string; value: string; required?: boolean }) { return <label className="block text-sm font-medium text-zinc-600">{label}<input name={name} defaultValue={value} required={required} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-zinc-400" /></label>; }
