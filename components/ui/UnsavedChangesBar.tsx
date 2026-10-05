"use client";

import { useEffect, useState } from "react";
import { Z_INDEX } from "@/lib/layout/z-index";

/** How long Discard waits for its second tap before going back to normal. */
const CONFIRM_MS = 3000;

/**
 * A slim pill that floats up while there are edits nobody has saved yet --
 * "Unsaved changes · Discard · Save" -- so leaving without saving isn't
 * something you can do by forgetting. It never blocks navigation; it just
 * stays in view until the edits are saved or thrown away.
 *
 * On a phone it sits just above the tab bar, on desktop centred along the
 * bottom. Always mounted and only moved out of view, so it slides away as
 * smoothly as it arrived; `inert` keeps the hidden bar out of reach.
 *
 * Discard asks for a second tap rather than a dialog: it's the one control
 * here that throws work away, and a single stray tap shouldn't be enough.
 */
export function UnsavedChangesBar({ visible, saving, onSave, onDiscard }: { visible: boolean; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  // Hidden again (saved, or discarded): the next appearance starts unarmed.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) setConfirming(false);
  }

  return (
    <div
      data-save-bar
      inert={!visible}
      className={`pointer-events-none fixed inset-x-4 bottom-[calc(var(--tab-bar-offset)+var(--tab-bar-height)+0.625rem)] ${Z_INDEX.chrome} flex justify-center md:bottom-6`}
    >
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex h-12 w-full max-w-md items-center gap-1 rounded-full bg-zinc-950/90 pl-5 pr-1.5 text-white shadow-[0_12px_32px_rgb(0,0,0,0.22)] backdrop-blur-xl transition-[translate,opacity] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <span aria-hidden="true" className="mr-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">
          {confirming ? "Discard all changes?" : "Unsaved changes"}
        </p>
        <button
          type="button"
          onClick={() => {
            if (!confirming) return setConfirming(true);
            setConfirming(false);
            onDiscard();
          }}
          disabled={saving}
          className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-40 ${
            confirming ? "bg-white/15 text-white" : "text-white/65 hover:text-white"
          }`}
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-9 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-zinc-950 transition-opacity disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
