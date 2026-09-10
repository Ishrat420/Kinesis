"use client";

import { ExternalLink, Link2, Pencil, Save, StickyNote, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import { KinesisLinkCard } from "@/components/custom-fields/KinesisLinkCard";
import type { CustomFieldValue, KinesisLinkOption } from "@/lib/custom-fields/types";
import type { GoalActionState } from "../actions";

const initialState: GoalActionState = {};

/**
 * A goal's supporting context (KD-033): notes, links to resources, and
 * Kinesis Links to other records -- kept separate from Milestones (meaningful
 * checkpoints) and Linked Goals (independent outcomes), which this exists
 * precisely so neither has to hold information that is not really either.
 *
 * Unobtrusive when empty, per the ticket's own direction: an empty state
 * reads as an invitation rather than three empty headings.
 */
export function GoalSupportingInfo({ fields, linkOptions, action }: {
  fields: CustomFieldValue[];
  linkOptions: KinesisLinkOption[];
  action: (state: GoalActionState, data: FormData) => Promise<GoalActionState>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Goal Details</h2>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit goal details" className="flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
            <Pencil className="h-4 w-4" />{fields.length ? "Edit" : "Add"}
          </button>
        )}
      </div>
      <div className="mt-5">
        {editing ? (
          <EditFields fields={fields} linkOptions={linkOptions} action={action} onDone={() => setEditing(false)} />
        ) : (
          <ReadFields fields={fields} linkOptions={linkOptions} />
        )}
      </div>
    </section>
  );
}

function ReadFields({ fields, linkOptions }: { fields: CustomFieldValue[]; linkOptions: KinesisLinkOption[] }) {
  if (!fields.length) return <p className="text-sm text-zinc-400">Nothing added yet -- notes, a link to a guide, a related document or account.</p>;

  const notes = fields.filter((field) => (field.type ?? "TEXT") === "TEXT");
  const links = fields.filter((field) => field.type === "LINK");
  // A field keeps its row here even once every target it pointed at is gone
  // -- the field itself survives that (see FieldLink's cascade), and hiding it
  // left the person with no way to know it was still there, blocking an
  // unrelated save the moment they opened Edit.
  const kinesisLinks = fields.flatMap((field) => {
    if (field.type !== "KINESIS_LINK") return [];
    const options = (field.targetObjectIds ?? []).flatMap((id) => linkOptions.find(({ objectId }) => objectId === id) ?? []);
    return [{ field, options }];
  });
  // A field type this section does not have its own group for -- Number,
  // Date, Checkbox -- still saved and shown, plainly, rather than dropped.
  const other = fields.filter((field) => field.type === "NUMBER" || field.type === "DATE" || field.type === "CHECKBOX");

  return (
    <div className="space-y-6">
      {(links.length > 0 || other.length > 0) && (
        <FieldGroup title="Links" icon={<Link2 className="h-4 w-4" />}>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((field) => (
              <div key={field.id ?? field.label}>
                <dt className="text-xs font-medium text-zinc-400">{field.label}</dt>
                <dd className="mt-1 break-words text-sm font-medium text-zinc-700">
                  {field.value ? <a href={field.value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">{field.value}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a> : "—"}
                </dd>
              </div>
            ))}
            {other.map((field) => (
              <div key={field.id ?? field.label}>
                <dt className="text-xs font-medium text-zinc-400">{field.label}</dt>
                <dd className="mt-1 break-words text-sm font-medium text-zinc-700">{field.type === "CHECKBOX" ? (field.value === "true" ? "Yes" : "No") : field.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </FieldGroup>
      )}

      {kinesisLinks.length > 0 && (
        <FieldGroup title="Kinesis Links" icon={<ExternalLink className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kinesisLinks.map(({ field, options }) => (
              <div key={field.id ?? field.label} className="min-w-0 space-y-2">
                <h3 className="mb-2 truncate text-xs font-medium text-zinc-500">{field.label}</h3>
                {options.length ? options.map((option) => <KinesisLinkCard key={option.objectId} option={option} />) : <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-400">Linked item no longer available</p>}
              </div>
            ))}
          </div>
        </FieldGroup>
      )}

      {notes.length > 0 && (
        <FieldGroup title="Notes" icon={<StickyNote className="h-4 w-4" />}>
          <div className="space-y-4">
            {notes.map((field) => (
              <div key={field.id ?? field.label}>
                <h3 className="text-xs font-medium text-zinc-400">{field.label}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{field.value || "—"}</p>
              </div>
            ))}
          </div>
        </FieldGroup>
      )}
    </div>
  );
}

function FieldGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">{icon}{title}</div>
      {children}
    </div>
  );
}

function EditFields({ fields, linkOptions, action, onDone }: {
  fields: CustomFieldValue[];
  linkOptions: KinesisLinkOption[];
  action: (state: GoalActionState, data: FormData) => Promise<GoalActionState>;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);

  return (
    <form action={formAction} className="space-y-5">
      <CustomFieldsEditor initialFields={fields} linkOptions={linkOptions} />
      {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 border-t border-zinc-100 pt-5">
        <button type="button" onClick={onDone} disabled={pending} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          <X className="h-4 w-4" />Cancel
        </button>
        <button disabled={pending} className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50">
          <Save className="h-4 w-4" />{pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
