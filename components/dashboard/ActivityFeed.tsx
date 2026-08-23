import Link from "next/link";
import { CheckCircle2, FileText, Landmark, Package, Target } from "lucide-react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import type { ActivityItem } from "@/lib/data/activity";

const icons = { documents: FileText, finance: Landmark, goals: Target };

function relativeTime(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(date);
}

export function ActivityFeed({ activity }: { activity: ActivityItem[] }) {
  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <span className="text-sm text-zinc-400">Latest updates</span>
      </div>

      <div className="space-y-5">
        {activity.map((item) => {
          const Icon = item.action === "Completed" ? CheckCircle2 : icons[item.icon as keyof typeof icons] ?? Package;
          const title = item.moduleName === "Finance"
            ? <>{item.action} <span className="break-words">{item.objectName}</span> under Finance</>
            : <>{item.action === "Added" && item.icon.startsWith("custom:") ? "Added a new" : item.action} {item.moduleName}: <span className="break-words">{item.objectName}</span></>;
          const content = <><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50">{item.icon.startsWith("custom:") ? <CustomModuleIcon name={item.icon.slice(7)} className="h-5 w-5 text-zinc-700" /> : <Icon className="h-5 w-5 text-zinc-700" />}</div><p className="min-w-0 font-medium text-zinc-700">{title}</p><time dateTime={item.createdAt.toISOString()} className="text-sm text-zinc-500">{relativeTime(item.createdAt)}</time></>;

          return item.href ? <Link key={item.id} href={item.href} className="grid grid-cols-[44px_1fr_auto] items-center gap-4 rounded-xl transition hover:bg-zinc-50">{content}</Link> : <div key={item.id} className="grid grid-cols-[44px_1fr_auto] items-center gap-4">{content}</div>;
        })}
        {!activity.length && <p className="py-8 text-center text-sm text-zinc-400">Your latest changes will appear here.</p>}
      </div>
    </section>
  );
}
