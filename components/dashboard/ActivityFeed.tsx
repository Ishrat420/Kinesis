import Link from "next/link";
import { FileText, Landmark, ListTodo, Package, Target, UsersRound, type LucideIcon } from "lucide-react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import type { RecentActivityItem } from "@/lib/data/object-event-history";
import { formatActivityTime, formatActivityTimeShort } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";
import { PhoneListLimit } from "./PhoneListLimit";
import { BEYOND_PHONE_LIMIT_CLASS, PHONE_LIST_LIMIT } from "./phone-list-limit";

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
const activityBadgeClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 sm:h-11 sm:w-11";
// 40px badge and 18px icon on a phone, to leave the text more width; 44px and 20px from sm up.
const activityIconClass = "h-[18px] w-[18px] text-zinc-700 sm:h-5 sm:w-5";

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
    // As Upcoming & Due: on a phone the card grows with its first few rows
    // and "Show all" instead of scrolling inside the page; fixed height from sm.
    <section className="flex flex-col rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:h-[396px]">
      <div className="mb-5 flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <span className="text-sm text-zinc-400">Latest updates</span>
      </div>

      <div className="min-h-0 flex-1 sm:overflow-y-auto sm:pr-2">
        {activity.length ? <PhoneListLimit total={activity.length}><div className="sm:space-y-4">{activity.map((item, index) => {
          const BuiltInIcon = OBJECT_TYPE_ICONS[item.objectType] ?? Package;
          return (
            <Link
              key={item.id} href={item.href}
              // A hairline between rows on a phone, where a row can now run
              // to several lines; spaced apart without one from sm up.
              className={`grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-zinc-100 py-3 transition first:border-t-0 first:pt-0 hover:bg-zinc-50 sm:-m-1 sm:grid-cols-[44px_1fr_auto] sm:gap-4 sm:rounded-xl sm:border-t-0 sm:p-1 sm:first:pt-1 ${index >= PHONE_LIST_LIMIT ? BEYOND_PHONE_LIMIT_CLASS : ""}`}
            >
              <div className={activityBadgeClass}>
                {item.icon ? <CustomModuleIcon name={item.icon} className={activityIconClass} /> : <BuiltInIcon className={activityIconClass} />}
              </div>
              <div className="min-w-0">
                {/* Up to two lines each on a phone instead of one cut short. */}
                <p className="line-clamp-2 break-words font-medium text-zinc-800 sm:line-clamp-1">{item.objectName}</p>
                <p className="line-clamp-2 break-words text-sm text-zinc-500 sm:line-clamp-1">{item.title}{item.detail ? `: ${item.detail}` : ""}</p>
              </div>
              {/* "1h" on a phone, "1 hour ago" from sm up. */}
              <time dateTime={item.occurredAt.toISOString()} className="shrink-0 text-sm text-zinc-500">
                <span className="sm:hidden">{formatActivityTimeShort(item.occurredAt, undefined, locale)}</span>
                <span className="hidden sm:inline">{formatActivityTime(item.occurredAt, undefined, locale)}</span>
              </time>
            </Link>
          );
        })}</div></PhoneListLimit> : <div className="flex h-full items-center justify-center py-8 text-center text-sm text-zinc-400 sm:py-0">Your latest changes will appear here.</div>}
      </div>
    </section>
  );
}
