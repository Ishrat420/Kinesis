import Link from "next/link";
import { CalendarDays, FileText, Flag, ListTodo, Pencil } from "lucide-react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import type { UpcomingItem } from "@/lib/data/upcoming";
import { getTodoLinkOptions } from "@/lib/data/todos";
import type { ObjectLocation } from "@/lib/objects/locations";
import { formatDate, formatDeadline, formatExpiry, formatFutureDate } from "@/lib/dates";
import { getFormatPreferences, getToday } from "@/lib/format/server";
import { toggleMilestoneAction, updateMilestoneDueDateAction } from "@/app/(app)/goals/actions";
import { setTodoStatusAction, updateTodoDueDateAction } from "@/app/(app)/todos/actions";
import { ResolveActions } from "./ResolveActions";
import { DismissButton } from "./DismissButton";
import { CreateTodoFromDateButton } from "./CreateTodoFromDateButton";
import { ICON_ACTION_CLASS } from "./icon-action-styles";
const icons = { document: FileText, milestone: Flag, relationship: CalendarDays, todo: ListTodo };
const upcomingBadgeClass = "flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50";

/**
 * A milestone or to-do gets the same Complete/Reschedule controls Needs
 * Attention already offers -- this is the same underlying item, just seen
 * from a wider window, so it should not need a second way to resolve it. A
 * document or custom item gets Edit plus Dismiss. A relationship date (an
 * Important Date) gets Create To-Do plus Dismiss (KD-047): there is nothing
 * here to mark complete or reschedule -- the date itself isn't a task -- but
 * turning it into one, prefilled, is the useful action Upcoming & Due can
 * offer that the record's own page does not.
 *
 * This renders inside ReminderList, a Server Component, so `complete` and
 * `reschedule` are only ever real server actions with their arguments bound
 * -- never a wrapping closure -- since a closure cannot cross a Server-to-
 * Client Component boundary as a prop the way a bound server action can.
 */
function UpcomingActions({ item, todoLinkOptions }: { item: UpcomingItem; todoLinkOptions: ObjectLocation[] }) {
  if (item.kind === "milestone") {
    return <ResolveActions
      dueDate={item.date}
      complete={toggleMilestoneAction.bind(null, item.goalId, item.milestoneId, true)}
      reschedule={updateMilestoneDueDateAction.bind(null, item.goalId, item.milestoneId)}
    />;
  }
  if (item.kind === "todo") {
    return <ResolveActions
      dueDate={item.date}
      complete={setTodoStatusAction.bind(null, item.todoId, "DONE")}
      reschedule={updateTodoDueDateAction.bind(null, item.todoId)}
    />;
  }
  if (item.kind === "document" || item.kind === "custom") {
    return <div className="flex shrink-0 items-center gap-2">
      <Link href={item.editHref} aria-label="Edit" title="Edit" className={`${ICON_ACTION_CLASS} hover:bg-zinc-50 hover:text-zinc-900`}><Pencil className="h-4 w-4" /></Link>
      <DismissButton itemKey={item.dismissKey} />
    </div>;
  }
  if (item.kind === "relationship") {
    return <div className="flex shrink-0 items-center gap-2">
      <CreateTodoFromDateButton
        suggestedTitle={item.suggestedTodoTitle}
        dueDate={item.date}
        personObjectId={item.personObjectId}
        linkOptions={todoLinkOptions}
      />
      <DismissButton itemKey={item.dismissKey} />
    </div>;
  }
  return null;
}

/**
 * Every kind, custom modules included, gets the same plain badge here: this
 * is the dashboard, where several modules' items sit side by side, and a
 * custom module's own colour would make this one list more colourful than
 * everything around it rather than reading as one calm summary. A custom
 * item still shows its own module's icon (via CustomModuleIcon) so it's
 * still identifiable at a glance -- only the colour is uniform, not the icon.
 */
function UpcomingIcon({ item }: { item: UpcomingItem }) {
  if (item.kind === "custom") return <div className={upcomingBadgeClass}><CustomModuleIcon name={item.icon} className="h-5 w-5 text-zinc-700" /></div>;
  const Icon = icons[item.kind];
  return <div className={upcomingBadgeClass}><Icon className="h-5 w-5 text-zinc-700" /></div>;
}

export async function ReminderList({ items }: { items: UpcomingItem[] }) {
  // Only an Important Date row's create-to-do action needs this, so it's
  // skipped on every dashboard render that has none rather than run for
  // every visitor regardless of what's actually in their list today.
  const needsTodoLinkOptions = items.some((item) => item.kind === "relationship");
  const [{ locale }, today, todoLinkOptions] = await Promise.all([
    getFormatPreferences(),
    getToday(),
    needsTodoLinkOptions ? getTodoLinkOptions() : Promise.resolve<ObjectLocation[]>([]),
  ]);
  return <section className="flex h-[396px] flex-col rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
    <div className="mb-5 flex shrink-0 items-center gap-2">
      <h2 className="text-lg font-semibold">Upcoming &amp; Due</h2>
      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-zinc-100 px-1.5 text-xs font-bold tabular-nums text-zinc-600">{items.length}</span>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto pr-2">
      {items.length ? <div className="space-y-1">{items.map((item) => {
        const timing = item.kind === "document" ? formatExpiry(item.date, today) : item.kind === "milestone" || item.kind === "todo" || item.kind === "custom" ? formatDeadline(item.date, today) : formatFutureDate(item.date, today);
        return <div key={item.id} className="flex items-center gap-4 py-1.5">
          <Link href={item.href} className="grid min-w-0 flex-1 grid-cols-[44px_1fr] items-center gap-4 rounded-xl transition hover:bg-zinc-50">
            <UpcomingIcon item={item} />
            <div className="min-w-0"><p className="truncate font-medium text-zinc-800">{item.title}</p><p className="text-sm text-zinc-500">{formatDate(item.date, locale)} · {timing}</p></div>
          </Link>
          <UpcomingActions item={item} todoLinkOptions={todoLinkOptions} />
        </div>;
      })}</div> : <div className="flex h-full items-center justify-center text-center text-sm text-zinc-400">Nothing is upcoming or overdue.</div>}
    </div>
  </section>;
}
