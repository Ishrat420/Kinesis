"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Link2, Pencil, Trash2 } from "lucide-react";
import type { TodoRecord } from "@/lib/data/todos";
import { TODO_STATUSES, isOpenTodoStatus, todoStatusLabel } from "@/lib/todos/status";
import { formatDate, formatDateInput, formatDeadline } from "@/lib/dates";
import { CaptureDetailsDialog } from "@/components/capture/CaptureDetailsDialog";
import { deleteTodoAction, setTodoStatusAction } from "./actions";

/**
 * The three ways of looking at captures asked for in KD-008C/KD-011.
 *
 * "Standalone" and "Connected" are the question ADR-009 cares about: has this
 * action been tied to something Kinesis understands yet, or is it still just a
 * note to self? A capture starts standalone by design, and moving it across is
 * the "organise later" half of the promise.
 */
export const TODO_SCOPES = [
  { value: "all", label: "All" },
  { value: "standalone", label: "Standalone" },
  { value: "connected", label: "Connected" },
] as const;

export type TodoScope = (typeof TODO_SCOPES)[number]["value"];

export const isTodoScope = (value: unknown): value is TodoScope =>
  TODO_SCOPES.some((scope) => scope.value === value);

const inScope = (todo: TodoRecord, scope: TodoScope) =>
  scope === "all" || (scope === "connected" ? todo.links.length > 0 : todo.links.length === 0);

export function TodoBoard({ todos, locale, scope }: { todos: TodoRecord[]; locale: string; scope: TodoScope }) {
  const [editing, setEditing] = useState<TodoRecord | null>(null);
  const visible = todos.filter((todo) => inScope(todo, scope));

  return (
    <section className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <nav aria-label="Filter to-dos" className="mb-5 flex flex-wrap gap-2">
        {TODO_SCOPES.map((option) => (
          <Link
            key={option.value} href={option.value === "all" ? "/todos" : `/todos?scope=${option.value}`} scroll={false}
            aria-current={option.value === scope ? "page" : undefined}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${option.value === scope ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
          >{option.label}</Link>
        ))}
      </nav>

      {visible.length ? (
        <ul className="divide-y divide-zinc-100">
          {visible.map((todo) => <TodoRow key={todo.id} todo={todo} locale={locale} onEdit={() => setEditing(todo)} />)}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-14 text-center">
          <p className="font-semibold text-zinc-700">{scope === "all" ? "Nothing captured yet" : `No ${scope} to-dos`}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {scope === "all" ? "Press ⌘K or Ctrl+K anywhere, type what you need to do, and press Enter." : "Change the filter to see the rest."}
          </p>
        </div>
      )}

      {editing && (
        <CaptureDetailsDialog
          todo={editing}
          defaults={{
            status: editing.status,
            dueDate: editing.dueDate ? formatDateInput(editing.dueDate) : "",
            linkObjectId: editing.links[0]?.objectId ?? "",
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function TodoRow({ todo, locale, onEdit }: { todo: TodoRecord; locale: string; onEdit: () => void }) {
  const [pending, startTransition] = useTransition();
  const open = isOpenTodoStatus(todo.status);

  return (
    <li id={`todo-${todo.id}`} className="flex flex-wrap items-center gap-3 py-4 scroll-mt-24">
      <button
        type="button" disabled={pending} aria-pressed={!open}
        aria-label={open ? `Mark ${todo.name} done` : `Reopen ${todo.name}`}
        onClick={() => startTransition(async () => { await setTodoStatusAction(todo.id, open ? "DONE" : "TODO"); })}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ${open ? "border-zinc-300 text-transparent hover:border-zinc-500 hover:text-zinc-400" : "border-emerald-600 bg-emerald-600 text-white"}`}
      ><Check className="h-4 w-4" aria-hidden="true" /></button>

      <div className="min-w-0 flex-1">
        <p className={`break-words font-medium ${open ? "text-zinc-900" : "text-zinc-400 line-through"}`}>{todo.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <span>{todoStatusLabel(todo.status)}</span>
          {open && todo.dueDate && <span>· {formatDate(todo.dueDate, locale)} · {formatDeadline(todo.dueDate)}</span>}
          {!open && todo.completedAt && <span>· {formatDate(todo.completedAt, locale)}</span>}
          {todo.links.map((link) => (
            <Link key={link.objectId} href={link.href} className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200">
              <Link2 className="h-3 w-3" aria-hidden="true" />{link.name}
            </Link>
          ))}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <select
          value={todo.status} disabled={pending} aria-label={`Status of ${todo.name}`}
          onChange={(event) => { const status = event.target.value; startTransition(async () => { await setTodoStatusAction(todo.id, status); }); }}
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 disabled:opacity-50"
        >
          {TODO_STATUSES.map((status) => <option key={status} value={status}>{todoStatusLabel(status)}</option>)}
        </select>
        <button type="button" onClick={onEdit} aria-label={`Edit ${todo.name}`} className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4" /></button>
        <button
          type="button" disabled={pending} aria-label={`Delete ${todo.name}`}
          onClick={() => startTransition(async () => { await deleteTodoAction(todo.id); })}
          className="rounded-xl p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        ><Trash2 className="h-4 w-4" /></button>
      </div>
    </li>
  );
}
