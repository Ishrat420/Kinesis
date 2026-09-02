import { ListTodo } from "lucide-react";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getTodos, getTodoSummary } from "@/lib/data/todos";
import { getFormatPreferences } from "@/lib/format/server";
import { DEFAULT_TODO_SCOPE, isTodoScope, type TodoScope } from "@/lib/todos/scopes";
import { TodoBoard } from "./TodoBoard";

/**
 * Where captures land (KD-008B).
 *
 * This is a To-Do list, not the unified action view: milestones, expiries and
 * reminders still belong to the surfaces that understand them, and gathering
 * them here is KD-011's question rather than this page's.
 */
export default async function TodosPage({ searchParams }: { searchParams: Promise<{ scope?: string | string[] }> }) {
  const [{ scope }, todos, summary, { locale }] = await Promise.all([
    searchParams,
    getTodos(),
    getTodoSummary(),
    getFormatPreferences(),
  ]);
  const requested = Array.isArray(scope) ? scope[0] : scope;
  const activeScope: TodoScope = isTodoScope(requested) ? requested : DEFAULT_TODO_SCOPE;

  return (
    <ModuleContent>
      <ModuleHeader
        title="To-Dos"
        description="Things you have captured, whether or not you have decided where they belong yet."
        icon={<ListTodo className="h-6 w-6" />}
      />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <StatCard title="Captured" value={summary.total} />
        <StatCard title="Still open" value={summary.open} />
        <StatCard title="Done" value={summary.done} />
      </div>

      <TodoBoard todos={todos} locale={locale} scope={activeScope} />
    </ModuleContent>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <p className="text-sm font-semibold text-zinc-500">{title}</p>
      <p className="mt-4 text-[38px] font-semibold leading-none tracking-tight">{value}</p>
    </div>
  );
}
