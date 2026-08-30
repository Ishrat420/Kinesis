import Link from "next/link";
import { CheckCircle2, FileText, Landmark, Package, Target, UsersRound } from "lucide-react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import type { ActivityItem } from "@/lib/data/activity";
import { formatActivityTime } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";

const icons = { documents: FileText, finance: Landmark, goals: Target, relationships: UsersRound };

export async function ActivityFeed({ activity }: { activity: ActivityItem[] }) {
  const { locale } = await getFormatPreferences();
  return (
    <section className="flex h-[396px] flex-col rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <span className="text-sm text-zinc-400">Latest updates</span>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
        {activity.map((item) => {
          const Icon = item.action === "Completed" ? CheckCircle2 : icons[item.icon as keyof typeof icons] ?? Package;
          const title = item.moduleName === "Finance"
            ? <>{item.action} <span className="break-words">{item.objectName}</span> under Finance</>
            : <>{item.action === "Added" && item.icon.startsWith("custom:") ? "Added a new" : item.action} {item.moduleName}: <span className="break-words">{item.objectName}</span></>;
          const content = <><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50">{item.icon.startsWith("custom:") ? <CustomModuleIcon name={item.icon.slice(7)} className="h-5 w-5 text-zinc-700" /> : <Icon className="h-5 w-5 text-zinc-700" />}</div><p className="min-w-0 font-medium text-zinc-700">{title}</p><time dateTime={item.createdAt.toISOString()} className="text-sm text-zinc-500">{formatActivityTime(item.createdAt, undefined, locale)}</time></>;

          return item.href ? <Link key={item.id} href={item.href} className="grid grid-cols-[44px_1fr_auto] items-center gap-4 rounded-xl transition hover:bg-zinc-50">{content}</Link> : <div key={item.id} className="grid grid-cols-[44px_1fr_auto] items-center gap-4">{content}</div>;
        })}
        {!activity.length && <p className="py-8 text-center text-sm text-zinc-400">Your latest changes will appear here.</p>}
      </div>
    </section>
  );
}
