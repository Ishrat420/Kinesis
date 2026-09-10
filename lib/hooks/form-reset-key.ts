"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Repaints a form's controlled fields after React resets the native `<form>`
 * following a successful action submission.
 *
 * The reset touches the DOM, not the React state driving these fields, so
 * without this they'd briefly show their empty/default values -- every
 * dropdown back to its first option, every text input blank -- until the page
 * is next reopened. Suffixing each field's own `key` with the returned
 * `resetRevision` throws the stale DOM node away and remounts it fresh from
 * current state instead.
 *
 * Attach `fieldsetRef` to the `<fieldset>` (or any ancestor) wrapping the
 * controlled fields.
 */
export function useFormResetKey() {
  const [resetRevision, setResetRevision] = useState(0);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    const form = fieldsetRef.current?.closest("form");
    if (!form) return;
    const restoreControlledValues = () => {
      window.setTimeout(() => setResetRevision((revision) => revision + 1), 0);
    };
    form.addEventListener("reset", restoreControlledValues);
    return () => form.removeEventListener("reset", restoreControlledValues);
  }, []);

  return { fieldsetRef, resetRevision };
}
