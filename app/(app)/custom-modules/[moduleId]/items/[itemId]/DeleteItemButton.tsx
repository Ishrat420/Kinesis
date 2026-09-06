"use client";

import { useActionState } from "react";
import { ActionSubmitButton } from "../../../ActionSubmitButton";
import type { CustomItemState } from "../../../actions";

const initialState: CustomItemState = {};

/**
 * Delete, with somewhere to put a refusal.
 *
 * The page is a Server Component, so the plain `<form action={...}>` it used
 * before had no channel for a result: on success the action redirects, and on
 * failure it used to throw straight past the page to the error boundary. This
 * is the smallest client component that can hold the answer.
 */
export function DeleteItemButton({ action }: { action: () => Promise<CustomItemState> }) {
  const [state, formAction] = useActionState(() => action(), initialState);
  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}><ActionSubmitButton tone="danger" idleLabel="Delete item" pendingLabel="Deleting…" /></form>
      {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
    </div>
  );
}
