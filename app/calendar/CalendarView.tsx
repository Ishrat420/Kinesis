"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, Filter, Repeat2, X } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useMemo, useState } from "react";
import type { CalendarItemKind, CalendarSourceType, KinesisCalendarItem } from "@/lib/calendar/types";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const sourceLabels: Record<CalendarSourceType, string> = { GOAL: "Goals", MILESTONE: "Milestones", DOCUMENT: "Documents", RELATIONSHIP: "Relationships", REMINDER: "Reminders", CUSTOM_OBJECT: "Custom modules" };

function dateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function monthParam(date: Date) { return dateKey(date).slice(0, 7); }
function monthDate(value: string) { const [year, month] = value.split("-").map(Number); return new Date(Date.UTC(year, month - 1, 1)); }
function displayTime(value?: string) {
  if (!value) return undefined;
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, hour, minute));
}

export function CalendarView({ items, month }: { items: KinesisCalendarItem[]; month: string }) {
  const router = useRouter();
  const selectedMonth = monthDate(month);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [filterOpen, setFilterOpen] = useState(false);
  const [kinds, setKinds] = useState<Set<CalendarItemKind>>(new Set(["DATED", "SCHEDULED"]));
  const [sources, setSources] = useState<Set<CalendarSourceType>>(new Set(Object.keys(sourceLabels) as CalendarSourceType[]));
  const [preview, setPreview] = useState<KinesisCalendarItem | null>(null);
  const [overviewDate, setOverviewDate] = useState<string | null>(null);
  const today = dateKey(new Date());
  const filtered = useMemo(() => items.filter((item) => kinds.has(item.kind) && sources.has(item.sourceType)), [items, kinds, sources]);
  const byDate = useMemo(() => Map.groupBy(filtered, (item) => item.date), [filtered]);
  const first = new Date(selectedMonth); first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(first); day.setUTCDate(first.getUTCDate() + index); return day; });
  const navigate = (offset: number) => { const next = new Date(selectedMonth); next.setUTCMonth(next.getUTCMonth() + offset); router.push(`/calendar?month=${monthParam(next)}`); };
  const toggle = <T extends string>(current: Set<T>, value: T, setter: (next: Set<T>) => void) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); setter(next); };

  return <>
      <ModuleHeader
        title="Calendar"
        description="Things will come up. Might as well see what’s coming."
        actions={<>
          <div className="flex items-center rounded-xl border border-zinc-200 bg-white p-1 shadow-sm"><button onClick={() => setView("month")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === "month" ? "bg-zinc-950 text-white" : "text-zinc-500"}`}>Month</button><button onClick={() => setView("agenda")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === "agenda" ? "bg-zinc-950 text-white" : "text-zinc-500"}`}>Agenda</button></div>
          <button onClick={() => setFilterOpen(!filterOpen)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm"><Filter className="h-4 w-4"/> Filters {(kinds.size < 2 || sources.size < 6) && <span className="h-2 w-2 rounded-full bg-violet-500"/>}</button>
        </>}
      />
      <div className="relative mt-7">
        <div className="mb-4 grid grid-cols-[44px_1fr_44px] items-center rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm md:mx-auto md:max-w-xl">
          <button aria-label="Previous month" onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-zinc-100"><ChevronLeft className="h-5 w-5"/></button>
          <div className="text-center"><h2 className="text-xl font-semibold">{selectedMonth.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}</h2><button onClick={() => router.push(`/calendar?month=${monthParam(new Date())}`)} className="mt-0.5 text-xs font-semibold text-violet-600 hover:text-violet-800">Today</button></div>
          <button aria-label="Next month" onClick={() => navigate(1)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-zinc-100"><ChevronRight className="h-5 w-5"/></button>
        </div>
        {filterOpen && <div className="absolute right-0 top-0 z-30 w-72 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Calendar filters</h3><button onClick={() => setFilterOpen(false)}><X className="h-4 w-4"/></button></div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">Item type</p>{(["DATED", "SCHEDULED"] as const).map((kind) => <label key={kind} className="flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" checked={kinds.has(kind)} onChange={() => toggle(kinds, kind, setKinds)}/>{kind === "DATED" ? "Dated" : "Scheduled"}</label>)}<p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Source</p>{(Object.entries(sourceLabels) as [CalendarSourceType, string][]).map(([source, label]) => <label key={source} className="flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" checked={sources.has(source)} onChange={() => toggle(sources, source, setSources)}/>{label}</label>)}</div>}
      </div>

      {view === "month" ? <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/80">{weekdays.map((day) => <div key={day} className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500">{day}</div>)}</div>
        <div className="grid grid-cols-7">{days.map((day) => { const key = dateKey(day); const dayItems = byDate.get(key) || []; const inMonth = day.getUTCMonth() === selectedMonth.getUTCMonth(); return <div key={key} className={`min-h-36 border-b border-r border-zinc-100 p-1.5 md:min-h-40 md:p-2 ${inMonth ? "bg-white" : "bg-zinc-50/60"}`}><button onClick={() => setOverviewDate(key)} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${key === today ? "bg-zinc-950 text-white" : inMonth ? "text-zinc-700 hover:bg-zinc-100" : "text-zinc-300"}`}>{day.getUTCDate()}</button><div className="space-y-1">{dayItems.slice(0, 3).map((item) => <ItemPill key={item.id} item={item} onClick={() => setPreview(item)}/>)}{dayItems.length > 3 && <button onClick={() => setOverviewDate(key)} className="w-full px-1 py-1 text-left text-xs font-semibold text-violet-600 hover:text-violet-800">+{dayItems.length - 3} more</button>}</div></div>})}</div>
      </section> : <Agenda items={filtered} onSelect={setPreview}/>} 
      <div className="mt-4 flex flex-wrap gap-5 text-xs text-zinc-500"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-violet-100 ring-1 ring-violet-200"/> Dated</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-teal-100 ring-1 ring-teal-200"/> Scheduled</span></div>
    {preview && <Preview item={preview} close={() => setPreview(null)}/>} 
    {overviewDate && <DayOverview date={overviewDate} items={byDate.get(overviewDate) || []} close={() => setOverviewDate(null)} onSelect={(item) => { setOverviewDate(null); setPreview(item); }}/>} 
  </>;
}

function ItemPill({ item, onClick }: { item: KinesisCalendarItem; onClick: () => void }) { return <button onClick={onClick} title={item.title} className={`flex w-full items-center gap-1 overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] font-semibold leading-4 ring-1 ${item.kind === "SCHEDULED" ? "bg-teal-50 text-teal-900 ring-teal-200" : "bg-violet-50 text-violet-900 ring-violet-200"}`}>{item.kind === "SCHEDULED" && <Clock3 className="h-3 w-3 shrink-0"/>}{item.startTime && <span className="shrink-0">{displayTime(item.startTime)}</span>}<span className="truncate">{item.title}</span>{item.recurring && <Repeat2 className="ml-auto h-3 w-3 shrink-0"/>}</button>; }
function Agenda({ items, onSelect }: { items: KinesisCalendarItem[]; onSelect: (item: KinesisCalendarItem) => void }) { const groups = Map.groupBy(items, (item) => item.date); return <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">{groups.size ? [...groups].map(([date, values]) => <div key={date} className="grid gap-3 border-b border-zinc-100 py-4 last:border-0 md:grid-cols-[160px_1fr]"><h3 className="font-semibold">{new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })}</h3><div className="space-y-2">{values.map((item) => <ItemPill key={item.id} item={item} onClick={() => onSelect(item)}/>)}</div></div>) : <p className="py-14 text-center text-zinc-400">No items match these filters.</p>}</section>; }
function Preview({ item, close }: { item: KinesisCalendarItem; close: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/25 p-4" onMouseDown={close}><article onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.kind === "SCHEDULED" ? "bg-teal-50 text-teal-700" : "bg-violet-50 text-violet-700"}`}><CalendarClock className="h-5 w-5"/></div><button onClick={close} className="rounded-lg p-2 hover:bg-zinc-100"><X className="h-4 w-4"/></button></div><span className="mt-5 inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold tracking-wide text-zinc-600">{item.kind}</span><h2 className="mt-3 text-xl font-semibold">{item.title}</h2><p className="mt-2 text-sm text-zinc-500">{new Date(`${item.date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}{item.startTime ? ` · ${displayTime(item.startTime)}` : ""}</p><p className="mt-4 text-sm leading-6 text-zinc-600">{item.detail}</p><div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4"><span className="text-xs font-semibold text-zinc-400">{item.sourceModule || sourceLabels[item.sourceType]} {item.recurring && "· Recurring"}</span><Link href={item.href} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">Open source →</Link></div></article></div>; }
function DayOverview({ date, items, close, onSelect }: { date: string; items: KinesisCalendarItem[]; close: () => void; onSelect: (item: KinesisCalendarItem) => void }) { return <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/25 p-4" onMouseDown={close}><section onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Day overview</p><h2 className="mt-1 text-xl font-semibold">{new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</h2></div><button onClick={close}><X className="h-5 w-5"/></button></div><div className="space-y-2">{items.length ? items.map((item) => <ItemPill key={item.id} item={item} onClick={() => onSelect(item)}/>) : <p className="rounded-2xl bg-zinc-50 py-8 text-center text-sm text-zinc-400">Nothing on this day.</p>}</div></section></div>; }
