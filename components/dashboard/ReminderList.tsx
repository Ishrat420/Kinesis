import Link from "next/link";
import { CalendarDays, FileText, Flag, ListTodo, Pencil, Target } from "lucide-react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import type { UpcomingItem } from "@/lib/data/upcoming";
import { getTodoLinkOptions } from "@/lib/data/todos";
import type { ObjectLocation } from "@/lib/objects/locations";
import { formatDate, formatDeadline, formatExpiry, formatFutureDate } from "@/lib/dates";
import { getFormatPreferences, getToday } from "@/lib/format/server";
import { toggleMilestoneAction, updateMilestoneDueDateAction, updateGoalTargetDateAction, updateGoalStatusAction } from "@/app/(app)/goals/actions";
import { setTodoStatusAction, updateTodoDueDateAction } from "@/app/(app)/todos/actions";
import { ResolveActions } from "./ResolveActions";
import { DismissButton } from "./DismissButton";
import { CreateTodoFromDateButton } from "./CreateTodoFromDateButton";
import { GoalOverdueActions } from "./GoalOverdueActions";
import { ICON_ACTION_CLASS } from "./icon-action-styles";
import { PhoneListLimit } from "./PhoneListLimit";
import { BEYOND_PHONE_LIMIT_CLASS, PHONE_LIST_LIMIT } from "./phone-list-limit";
const icons = { document: FileText, milestone: Flag, relationship: CalendarDays, todo: ListTodo, goal: Target };
// 40px on a phone, to leave the row's text more width; 44px from sm up.
const upcomingBadgeClass = "flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 sm:h-11 sm:w-11";
const upcomingIconClass = "h-[18px] w-[18px] text-zinc-700 sm:h-5 sm:w-5";

/**
 * A milestone or to-do gets the same Complete/Reschedule controls Needs
 * Attention already offers -- this is the same underlying item, just seen
 * from a wider window, so it should not need a second way to resolve it. A
 * document or custom item gets Edit plus Dismiss. A relationship date (an
 * Important Date) gets Create To-Do plus Dismiss (KD-047): there is nothing
 * here to mark complete or reschedule -- the date itself isn't a task -- but
 * turning it into one, prefilled, is the useful action Upcoming & Due can
 * offer that the record's own page does not. A goal (KD-028) gets its own
 * pair -- edit due date or change status -- since neither Complete nor
 * Dismiss fits a goal the way they fit a milestone or to-do.
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
      complete={toggleMilestoneAction.bind(null, item.goalId, item.milestoneId, true, item.date)}
      reschedule={updateMilestoneDueDateAction.bind(null, item.goalId, item.milestoneId)}
    />;
  }
  if (item.kind === "todo") {
    return <ResolveActions
      dueDate={item.date}
      complete={setTodoStatusAction.bind(null, item.todoId, "DONE", item.date)}
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
  if (item.kind === "goal") {
    return <GoalOverdueActions
      targetDate={item.date}
      updateTargetDate={updateGoalTargetDateAction.bind(null, item.goalId)}
      updateStatus={updateGoalStatusAction.bind(null, item.goalId)}
    />;
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
  if (item.kind === "custom") return <div className={upcomingBadgeClass}><CustomModuleIcon name={item.icon} className={upcomingIconClass} /></div>;
  const Icon = icons[item.kind];
  return <div className={upcomingBadgeClass}><Icon className={upcomingIconClass} /></div>;
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
  // On a phone the card grows with its rows (the first few, then "Show
  // all") rather than scrolling inside a page that scrolls; from sm up it
  // keeps its fixed height and scroll box.
  return <section className="flex flex-col rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:h-[396px]">
    <div className="mb-5 flex shrink-0 items-center gap-2">
      <h2 className="text-lg font-semibold">Upcoming &amp; Due</h2>
      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-zinc-100 px-1.5 text-xs font-bold tabular-nums text-zinc-600">{items.length}</span>
    </div>
    <div className="min-h-0 flex-1 sm:overflow-y-auto sm:pr-2">
      {items.length ? <PhoneListLimit total={items.length}><div className="sm:space-y-1">{items.map((item, index) => {
        const timing = item.kind === "document" ? formatExpiry(item.date, today) : item.kind === "milestone" || item.kind === "todo" || item.kind === "custom" || item.kind === "goal" ? formatDeadline(item.date, today) : formatFutureDate(item.date, today);
        // On a phone the actions sit under the text, lined up with it, so the
        // title and date get the row's whole width and the title can wrap to
        // two lines; from sm up they sit to the right as before. A hairline
        // between rows on a phone, where a row now spans several lines.
        return <div key={item.id} className={`flex flex-col gap-1.5 border-t border-zinc-100 py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:gap-4 sm:border-t-0 sm:py-1.5 sm:first:pt-1.5 ${index >= PHONE_LIST_LIMIT ? BEYOND_PHONE_LIMIT_CLASS : ""}`}>
          <Link href={item.href} className="grid min-w-0 flex-1 grid-cols-[40px_1fr] items-center gap-3 rounded-xl transition hover:bg-zinc-50 sm:grid-cols-[44px_1fr] sm:gap-4">
            <UpcomingIcon item={item} />
            <div className="min-w-0"><p className="line-clamp-2 break-words font-medium text-zinc-800 sm:line-clamp-1">{item.title}</p><p className="text-sm text-zinc-500">{formatDate(item.date, locale)} · {timing}</p></div>
          </Link>
          <div className="flex shrink-0 pl-[52px] sm:pl-0"><UpcomingActions item={item} todoLinkOptions={todoLinkOptions} /></div>
        </div>;
      })}</div></PhoneListLimit> : <div className="flex h-full items-center justify-center py-8 text-center text-sm text-zinc-400 sm:py-0">Nothing is upcoming or overdue.</div>}
    </div>
  </section>;
}
