"use client";

import { useActionState, useCallback, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { createCustomItemAction, type CustomItemState } from "../actions";
import { ActionSubmitButton } from "../ActionSubmitButton";
import { Modal } from "@/components/overlay/Modal";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import { TemplateFieldValues, type TemplateFieldValue } from "@/components/custom-fields/TemplateFieldValues";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";
import { Z_INDEX } from "@/lib/layout/z-index";

const initialState: CustomItemState = {};

/**
 * A real border and real size (50px) at rest, the same treatment every
 * redesigned create/edit form in the app shares -- the module's own colour
 * (set as a CSS variable by the caller) stands in for To-Do's teal or
 * Finance's emerald, since a custom module's colour is per-module, not fixed.
 */
const FIELD_CLASS =
  "h-[50px] w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[var(--nb-accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nb-accent)_15%,transparent)] sm:text-sm";
const FIELD_LABEL_CLASS = "mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900";

export function NewItemButton({
  moduleId, moduleColor, moduleIcon, linkOptions, previews = {}, templateFields = [],
}: {
  moduleId: string;
  moduleColor: string;
  moduleIcon: string;
  linkOptions: KinesisLinkOption[];
  previews?: Record<string, KinesisLinkPreviewStat[]>;
  templateFields?: TemplateFieldValue[];
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const createItem = useCallback(async (previousState: CustomItemState, data: FormData) => {
    const result = await createCustomItemAction(moduleId, previousState, data);
    if (result.error) return result;
    setOpen(false);
    setCreated(true);
    window.setTimeout(() => setCreated(false), 3000);
    return result;
  }, [moduleId]);
  const [state, formAction] = useActionState(createItem, initialState);

  return <>
    {created && <div role="status" className={`fixed right-6 top-24 ${Z_INDEX.top} flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm font-semibold text-emerald-700 shadow-lg`}><CheckCircle2 className="h-5 w-5"/> Item created</div>}
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"><Plus className="h-4 w-4" /> New item</button>
    {open && (
      <Modal
        labelledBy="new-item-title"
        onClose={() => setOpen(false)}
        customHeader
        panelClassName="p-0 sm:max-w-lg !rounded-t-2xl sm:!rounded-2xl"
      >
        <div style={{ "--nb-accent": moduleColor } as React.CSSProperties}>
          <div className="flex items-center gap-3 px-2.5 py-4 sm:px-5 sm:py-5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `color-mix(in srgb, ${moduleColor} 12%, white)`, color: moduleColor }}
            >
              <CustomModuleIcon name={moduleIcon} className="h-5 w-5" />
            </span>
            <h2 id="new-item-title" className="flex-1 text-xl font-bold text-zinc-900 sm:text-2xl">
              Create a new item
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form action={formAction}>
            <div className="space-y-4 px-2.5 py-5 sm:px-5">
              <div>
                <label htmlFor="new-item-name" className={FIELD_LABEL_CLASS}>
                  Name <span className="font-bold text-red-500">*</span>
                </label>
                <input id="new-item-name" required autoFocus name="name" maxLength={100} placeholder="Item name" className={FIELD_CLASS} />
              </div>
              {templateFields.length > 0 && <TemplateFieldValues fields={templateFields} linkOptions={linkOptions} previews={previews} />}
              <CustomFieldsEditor linkOptions={linkOptions} previews={previews} />
              {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
            </div>

            <div className="flex flex-col-reverse gap-2 px-2.5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:px-5 sm:pt-5 sm:pb-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 rounded-xl border-[1.5px] border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 sm:h-10"
              >
                Cancel
              </button>
              <ActionSubmitButton idleLabel="Create item" pendingLabel="Creating…" />
            </div>
          </form>
        </div>
      </Modal>
    )}
  </>;
}
