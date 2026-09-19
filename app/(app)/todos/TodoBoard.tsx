"use client";

import Link from "next/link";
import { useActionState, useEffect, useOptimistic, useState, useTransition } from "react";
import { CalendarClock, CalendarDays, Check, Ellipsis, Link2, Search, X } from "lucide-react";
import type { TodoRecord } from "@/lib/data/todos";
import { isOpenTodoStatus, todoStatusDotClass, todoStatusLabel } from "@/lib/todos/status";
import { groupTodosByUrgency, type TodoUrgencyGroup } from "@/lib/todos/groups";
import { TODO_SCOPES, DEFAULT_TODO_SCOPE, type TodoScope } from "@/lib/todos/scopes";
import { formatDate, formatDateInput, formatDeadline } from "@/lib/dates";
import { CaptureDetailsDialog } from "@/components/capture/CaptureDetailsDialog";
import { InlineDatePicker } from "@/components/dashboard/InlineDatePicker";
import { useToday } from "@/lib/format/context";
import { deleteTodoAction, setTodoStatusAction, updateTodoDueDateAction, type TodoActionState } from "./actions";

const initialRescheduleState: TodoActionState = {};

/** A group heading's colour, matching the app's existing overdue/due-soon/neutral semantics. */
const GROUP_LABEL_CLASS: Record<TodoUrgencyGroup, string> = {
  overdue: "text-red-600",
  "due-soon": "text-amber-700",
  later: "text-zinc-500",
  "no-date": "text-zinc-400",
  completed: "text-zinc-400",
};

const inScope = (todo: TodoRecord, scope: TodoScope) =>
  scope === "all" || (scope === "connected" ? todo.links.length > 0 : todo.links.length === 0);

export function TodoBoard({ todos, locale, scope }: { todos: TodoRecord[]; locale: string; scope: TodoScope }) {
  const [editing, setEditing] = useState<TodoRecord | null>(null);
  const [query, setQuery] = useState("");
  const today = useToday();
  const trimmedQuery = query.trim().toLowerCase();
  const visible = todos.filter((todo) => inScope(todo, scope) && (!trimmedQuery || todo.name.toLowerCase().includes(trimmedQuery)));
  const groups = groupTodosByUrgency(visible, today);

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
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-1 flex items-baseline gap-2 border-b border-zinc-100 pb-2">
                <span className={`text-xs font-bold uppercase tracking-widest ${GROUP_LABEL_CLASS[group.key]}`}>{group.label}</span>
                <span className="text-xs font-semibold text-zinc-400">{group.todos.length}</span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {group.todos.map((todo) => <TodoRow key={todo.id} todo={todo} locale={locale} onEdit={() => setEditing(todo)} />)}
              </ul>
            </div>
          ))}
        </div>
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
            notes: editing.notes ?? "",
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
  const status = isOpenTodoStatus(todo.status);
  // Shown the instant the checkbox is clicked, before the server round trip
  // that used to be the only thing that ever changed it. Reconciles itself
  // once the real `todo.status` prop catches up (success), or reverts on its
  // own once the transition below settles without it having moved (failure).
  const [optimisticOpen, setOptimisticOpen] = useOptimistic(status);
  const open = optimisticOpen;
  // Gates the pop animation below to an actual toggle in this session, rather
  // than `open` itself -- that would also be false for a to-do that was
  // already done on page load, playing the animation on every visit to the
  // board instead of only when someone just marked it done.
  const [hasToggled, setHasToggled] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

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

  function toggleDone() {
    startTransition(async () => {
      setOptimisticOpen(!status);
      setHasToggled(true);
      setError(null);
      setError((await setTodoStatusAction(todo.id, status ? "DONE" : "TODO")).error ?? null);
    });
  }

  return (
    <li id={`todo-${todo.id}`} className="flex flex-wrap items-center gap-3 py-4 scroll-mt-24">
      <button
        type="button" disabled={pending} aria-pressed={!open}
        aria-label={open ? `Mark ${todo.name} done` : `Reopen ${todo.name}`}
        onClick={toggleDone}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-70 ${open ? "border-zinc-300 text-transparent hover:border-zinc-500 hover:text-zinc-400" : "border-emerald-600 bg-emerald-600 text-white"}`}
      ><Check className={`h-4 w-4 ${!open && hasToggled ? "checkbox-pop" : ""}`} aria-hidden="true" /></button>

      <div className="min-w-0 flex-1">
        {/*
          Only the title links to the to-do's own detail page (KD-048) -- the
          metadata line below has its own Kinesis Link pills, and nesting an
          <a> inside another <a> is invalid HTML (and breaks hydration).
        */}
        <Link href={`/todos/${todo.id}`} className={`break-words font-medium hover:underline ${open ? "text-zinc-900" : "text-zinc-400 line-through"}`}>{todo.name}</Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <span className="inline-flex items-center">
            <span aria-hidden="true" className={`mr-1.5 h-1.5 w-1.5 rounded-full ${todoStatusDotClass(todo.status)}`} />
            {todoStatusLabel(todo.status)}
          </span>
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
        {todo.notes && <p className="mt-1 truncate text-xs italic text-zinc-400">{todo.notes}</p>}
      </div>

      {rescheduling ? (
        <TodoRescheduleForm todoId={todo.id} dueDate={todo.dueDate} onDone={() => setRescheduling(false)} />
      ) : (
      <div className="flex shrink-0 items-center gap-1">
        {open && (
          <button
            type="button" onClick={() => setRescheduling(true)}
            aria-label={`Reschedule ${todo.name}`} title="Reschedule"
            className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          ><CalendarClock className="h-4 w-4" /></button>
        )}
      <details className="relative">
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
      </div>
      )}

      {error && <p role="alert" className="w-full text-sm font-medium text-red-600">{error}</p>}
    </li>
  );
}

/**
 * Mounted only while rescheduling, so a fresh `useActionState` starts each
 * time it opens -- kept in the row, `state.saved` would flip false to true
 * exactly once and stay true across every later reschedule in the same
 * session (the same pitfall `MilestoneEditForm` documents), and the effect
 * below fires on that transition, so a second reschedule would save silently
 * with no form closing to show for it.
 */
function TodoRescheduleForm({ todoId, dueDate, onDone }: { todoId: string; dueDate: Date | null; onDone: () => void }) {
  const [state, formAction] = useActionState(updateTodoDueDateAction.bind(null, todoId), initialRescheduleState);
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);

  return (
    <form action={formAction} onClick={(event) => event.stopPropagation()} className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <InlineDatePicker name="dueDate" defaultValue={dueDate ? formatDateInput(dueDate) : ""} ariaLabel="New due date" />
        <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">Save</button>
        <button type="button" onClick={onDone} aria-label="Cancel reschedule" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
      </div>
      {state.error && <p role="alert" className="text-xs font-medium text-red-600">{state.error}</p>}
    </form>
  );
}
