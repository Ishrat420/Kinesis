import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Clock3, ExternalLink, Link2, StickyNote, Trash2 } from "lucide-react";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { getCustomModule } from "@/lib/data/custom-modules";
import { deleteCustomItemAction, toggleCustomItemArchivedAction } from "../actions";
import { NewItemButton } from "./NewItemButton";

const formatDate = (date: Date) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);

export default async function CustomModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const customModule = await getCustomModule(moduleId);
  if (!customModule) notFound();
  const activeItems = customModule.items.filter((item) => !item.archived);
  const archivedItems = customModule.items.filter((item) => item.archived);
  return <main className="min-h-screen bg-[#f7f8fb] text-zinc-950"><Topbar /><div className="flex"><Sidebar /><section className="min-w-0 flex-1 px-6 py-8 md:px-10"><div className="max-w-5xl">
    <header className="flex flex-wrap items-start justify-between gap-5"><div className="flex items-start gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: customModule.color }}><CustomModuleIcon name={customModule.icon} className="h-7 w-7" /></span><div><h1 className="text-[38px] font-semibold leading-none tracking-tight">{customModule.name}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">{customModule.description || "A place for the things that matter to you."}</p></div></div><NewItemButton moduleId={customModule.id} color={customModule.color} /></header>
    {!customModule.items.length ? <div className="mt-16 rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: `${customModule.color}14`, color: customModule.color }}><CustomModuleIcon name={customModule.icon} className="h-7 w-7" /></span><h2 className="mt-5 text-xl font-semibold">Nothing here yet.</h2><p className="mt-2 text-zinc-500">Create your first object to get started.</p><div className="mt-7"><NewItemButton moduleId={customModule.id} color={customModule.color} /></div></div> : <div className="mt-10 space-y-8">
      <ItemSection title="Items" items={activeItems} moduleId={customModule.id} color={customModule.color} />
      {archivedItems.length > 0 && <ItemSection title="Archived" items={archivedItems} moduleId={customModule.id} color={customModule.color} />}
    </div>}
  </div></section></div></main>;
}

type Item = NonNullable<Awaited<ReturnType<typeof getCustomModule>>>["items"][number];
function ItemSection({ title, items, moduleId, color }: { title: string; items: Item[]; moduleId: string; color: string }) {
  if (!items.length) return null;
  return <section><div className="mb-3 flex items-center gap-2"><h2 className="text-lg font-semibold">{title}</h2><span className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-xs font-semibold text-zinc-500">{items.length}</span></div><div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.035)]"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} /><h3 className="truncate text-lg font-semibold">{item.name}</h3>{item.archived && <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-500">Archived</span>}</div><div className="flex shrink-0 gap-1"><form action={toggleCustomItemArchivedAction.bind(null, moduleId, item.id, !item.archived)}><button title={item.archived ? "Restore" : "Archive"} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">{item.archived ? <ArchiveRestore className="h-4 w-4"/> : <Archive className="h-4 w-4"/>}</button></form><form action={deleteCustomItemAction.bind(null, moduleId, item.id)}><button title="Delete" className="rounded-xl p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></form></div></div>
    {(item.fields.length > 0 || item.notes || item.reminder || item.link) && <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">{item.fields.map((field) => <div key={field.id}><p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{field.label}</p><p className="mt-1 text-sm text-zinc-700">{field.value || "—"}</p></div>)}{item.notes && <div><p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"><StickyNote className="h-3 w-3"/> Notes</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{item.notes}</p></div>}{item.reminder && <div><p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"><Clock3 className="h-3 w-3"/> Reminder</p><p className="mt-1 text-sm text-zinc-700">{formatDate(item.reminder)}</p></div>}{item.link && <div><p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"><Link2 className="h-3 w-3"/> Link</p><a href={item.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm font-medium hover:underline" style={{ color }}>{item.link}<ExternalLink className="h-3 w-3 shrink-0"/></a></div>}</div>}
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400"><span>Created {formatDate(item.createdAt)}</span><span>Updated {formatDate(item.updatedAt)}</span><span>Archived: {item.archived ? "true" : "false"}</span></div>
  </article>)}</div></section>;
}
