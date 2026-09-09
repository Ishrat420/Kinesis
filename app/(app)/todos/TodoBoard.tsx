"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarDays, Check, Ellipsis, Link2, Search } from "lucide-react";
import type { TodoRecord } from "@/lib/data/todos";
import { isOpenTodoStatus, todoStatusLabel } from "@/lib/todos/status";
import { TODO_SCOPES, DEFAULT_TODO_SCOPE, type TodoScope } from "@/lib/todos/scopes";
import { formatDate, formatDateInput, formatDeadline } from "@/lib/dates";
import { CaptureDetailsDialog } from "@/components/capture/CaptureDetailsDialog";
import { useToday } from "@/lib/format/context";
import { deleteTodoAction, setTodoStatusAction } from "./actions";

const inScope = (todo: TodoRecord, scope: TodoScope) =>
  scope === "all" || (scope === "connected" ? todo.links.length > 0 : todo.links.length === 0);

export function TodoBoard({ todos, locale, scope }: { todos: TodoRecord[]; locale: string; scope: TodoScope }) {
  const [editing, setEditing] = useState<TodoRecord | null>(null);
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim().toLowerCase();
  const visible = todos.filter((todo) => inScope(todo, scope) && (!trimmedQuery || todo.name.toLowerCase().includes(trimmedQuery)));

  return (
    <section className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter to-dos" className="flex flex-wrap gap-2">
          {TODO_SCOPES.map((option) => (
            <Link
              key={option.value} href={option.value === DEFAULT_TODO_SCOPE ? "/todos" : `/todos?scope=${option.value}`} scroll={false}
              aria-current={option.value === scope ? "page" : undefined}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${option.value === scope ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
            >{option.label}</Link>
          ))}
        </nav>
        <div className="flex h-11 w-full items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 text-zinc-400 sm:w-80">
          <Search className="h-[18px] w-[18px]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search to-dos"
            className="w-full bg-transparent text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
            placeholder="Search to-dos..."
          />
        </div>
      </div>

      {visible.length ? (
        <ul className="divide-y divide-zinc-100">
          {visible.map((todo) => <TodoRow key={todo.id} todo={todo} locale={locale} onEdit={() => setEditing(todo)} />)}
        </ul>
      ) : trimmedQuery ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-14 text-center">
          <p className="font-semibold text-zinc-700">No to-dos match &ldquo;{query.trim()}&rdquo;</p>
          <p className="mt-1 text-sm text-zinc-400">Try a different search.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-14 text-center">
          <p className="font-semibold text-zinc-700">{scope === DEFAULT_TODO_SCOPE ? "Nothing captured yet" : `No ${scope} to-dos`}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {scope === DEFAULT_TODO_SCOPE ? "Press ⌘K or Ctrl+K anywhere, type what you need to do, and press Enter." : "Change the filter to see the rest."}
          </p>
        </div>
      )}

      {editing && (
        <CaptureDetailsDialog
          todo={editing}
          defaults={{
            status: editing.status,
            dueDate: editing.dueDate ? formatDateInput(editing.dueDate) : "",
            linkObjectIds: editing.links.map((link) => link.objectId),
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function TodoRow({ todo, locale, onEdit }: { todo: TodoRecord; locale: string; onEdit: () => void }) {
  const today = useToday();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = isOpenTodoStatus(todo.status);

  /**
   * These used to be awaited and ignored inside the transition, so a failed
   * checkbox threw past the row and took the page with it. The row reports it
   * instead and stays put -- and the error clears on the next attempt rather
   * than lingering over a to-do that has since worked.
   */
  const run = (action: () => Promise<{ error?: string }>) => startTransition(async () => {
    setError(null);
    setError((await action()).error ?? null);
  });

  return (
    <li id={`todo-${todo.id}`} className="flex flex-wrap items-center gap-3 py-4 scroll-mt-24">
      <button
        type="button" disabled={pending} aria-pressed={!open}
        aria-label={open ? `Mark ${todo.name} done` : `Reopen ${todo.name}`}
        onClick={() => run(() => setTodoStatusAction(todo.id, open ? "DONE" : "TODO"))}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ${open ? "border-zinc-300 text-transparent hover:border-zinc-500 hover:text-zinc-400" : "border-emerald-600 bg-emerald-600 text-white"}`}
      ><Check className="h-4 w-4" aria-hidden="true" /></button>

      <div className="min-w-0 flex-1">
        <p className={`break-words font-medium ${open ? "text-zinc-900" : "text-zinc-400 line-through"}`}>{todo.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <span>{todoStatusLabel(todo.status)}</span>
          {!open && todo.completedAt && <span>· {formatDate(todo.completedAt, locale)}</span>}
          {open && todo.dueDate && (
            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${todo.dueDate < today ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-700"}`}>
              <CalendarDays className="h-3 w-3" aria-hidden="true" />{formatDate(todo.dueDate, locale)} · {formatDeadline(todo.dueDate, today)}
            </span>
          )}
          {todo.links.map((link) => (
            <Link key={link.objectId} href={link.href} className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200">
              <Link2 className="h-3 w-3" aria-hidden="true" />{link.name}
            </Link>
          ))}
        </p>
      </div>

      <details className="relative shrink-0">
        <summary aria-label={`${todo.name} actions`} className="list-none rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Ellipsis className="h-5 w-5" /></summary>
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-zinc-200 bg-white p-1.5 text-sm shadow-lg">
          <button type="button" onClick={onEdit} className="w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-50">Edit</button>
          <button
            type="button" disabled={pending}
            onClick={() => run(() => deleteTodoAction(todo.id))}
            className="w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:opacity-50"
          >Delete</button>
        </div>
      </details>

      {error && <p role="alert" className="w-full text-sm font-medium text-red-600">{error}</p>}
    </li>
  );
}
