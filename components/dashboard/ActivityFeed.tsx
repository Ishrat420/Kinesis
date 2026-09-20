import Link from "next/link";
import { FileText, Landmark, ListTodo, Package, Target, UsersRound, type LucideIcon } from "lucide-react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import type { RecentActivityItem } from "@/lib/data/object-event-history";
import { formatActivityTime } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";

/** Every built-in object type's own icon for the feed's badge -- a custom module's own item brings its own via `item.icon` instead (see `ObjectLocation`). */
const OBJECT_TYPE_ICONS: Record<string, LucideIcon> = {
  DOCUMENT: FileText, GOAL: Target, TODO: ListTodo, FINANCE_ITEM: Landmark, PERSON: UsersRound,
};

/**
 * Deliberately monochrome, matching Upcoming & Due's own `UpcomingIcon`
 * (`components/dashboard/ReminderList.tsx`): several modules' items sit
 * side by side on the dashboard, and a per-module color here would make
 * this one card more colorful than everything around it rather than
 * reading as one calm summary. A custom module's own item still shows its
 * own icon (via `CustomModuleIcon`), just not tinted with its module color.
 */
const activityBadgeClass = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50";

/**
 * The account's most recent changes across every object (KD-048 Phase 2),
 * replacing the old flat `ActivityEvent` log's `Added`/`Updated` sentences
 * with the same real per-field facts an object's own History section shows
 * -- "Amount changed: From $10,500.00 to $9,000.00" rather than "Updated
 * Credit cards under Finance".
 */
export async function ActivityFeed({ activity }: { activity: RecentActivityItem[] }) {
  const { locale } = await getFormatPreferences();
  return (
    <section className="flex h-[396px] flex-col rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <span className="text-sm text-zinc-400">Latest updates</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {activity.length ? <div className="space-y-4">{activity.map((item) => {
          const BuiltInIcon = OBJECT_TYPE_ICONS[item.objectType] ?? Package;
          return (
            <Link
              key={item.id} href={item.href}
              className="-m-1 grid grid-cols-[44px_1fr_auto] items-center gap-4 rounded-xl p-1 transition hover:bg-zinc-50"
            >
              <div className={activityBadgeClass}>
                {item.icon ? <CustomModuleIcon name={item.icon} className="h-5 w-5 text-zinc-700" /> : <BuiltInIcon className="h-5 w-5 text-zinc-700" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-800">{item.objectName}</p>
                <p className="truncate text-sm text-zinc-500">{item.title}{item.detail ? `: ${item.detail}` : ""}</p>
              </div>
              <time dateTime={item.occurredAt.toISOString()} className="shrink-0 text-sm text-zinc-500">{formatActivityTime(item.occurredAt, undefined, locale)}</time>
            </Link>
          );
        })}</div> : <div className="flex h-full items-center justify-center text-center text-sm text-zinc-400">Your latest changes will appear here.</div>}
      </div>
    </section>
  );
}
