import Link from "next/link";
import { CalendarDays, FileText, Flag, ListTodo } from "lucide-react";
import { CustomModuleBadge } from "@/lib/custom-modules/icons";
import type { UpcomingItem } from "@/lib/data/upcoming";
import { formatDate, formatDeadline, formatExpiry, formatFutureDate } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";
const icons = { document: FileText, milestone: Flag, relationship: CalendarDays, todo: ListTodo };
/** A custom module object keeps its module's icon and colour; every other kind has one fixed icon. */
function UpcomingIcon({ item }: { item: UpcomingItem }) {
  if (item.kind === "custom") return <CustomModuleBadge icon={item.icon} color={item.color} className="h-11 w-11 rounded-xl border border-zinc-200/80" iconClassName="h-5 w-5" />;
  const Icon = icons[item.kind];
  return <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50"><Icon className="h-5 w-5 text-zinc-700" /></div>;
}

export async function ReminderList({ items }: { items: UpcomingItem[] }) {
  const { locale } = await getFormatPreferences();
  const now = new Date();
  return <section className="flex h-[396px] flex-col rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="mb-5 flex shrink-0 items-center justify-between"><h2 className="text-lg font-semibold">Upcoming &amp; Due</h2></div><div className="min-h-0 flex-1 overflow-y-auto pr-2">{items.length ? <div className="space-y-4">{items.map((item) => { const timing = item.kind === "document" ? formatExpiry(item.date, now) : item.kind === "milestone" || item.kind === "todo" || item.kind === "custom" ? formatDeadline(item.date, now) : formatFutureDate(item.date, now); return <Link key={item.id} href={item.href} className="grid grid-cols-[44px_1fr] items-center gap-4 rounded-xl transition hover:bg-zinc-50"><UpcomingIcon item={item} /><div className="min-w-0"><p className="font-medium text-zinc-800">{item.title}</p><p className="text-sm text-zinc-500">{formatDate(item.date, locale)} · {timing}</p></div></Link>; })}</div> : <div className="flex h-full items-center justify-center text-center text-sm text-zinc-400">Nothing is upcoming or overdue.</div>}</div></section>;
}
