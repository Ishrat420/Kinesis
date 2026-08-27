import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { getCustomModule } from "@/lib/data/custom-modules";
import { NewItemButton } from "./NewItemButton";
import { DeleteModuleButton } from "./DeleteModuleButton";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";

export default async function CustomModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const [customModule, linkOptions] = await Promise.all([getCustomModule(moduleId), getKinesisLinkOptions()]);
  if (!customModule) notFound();
  const activeItems = customModule.items.filter((item) => !item.archived);
  const archivedItems = customModule.items.filter((item) => item.archived);
  return <main className="min-h-screen bg-[#f7f8fb] text-zinc-950"><Topbar /><div className="flex"><Sidebar /><section className="min-w-0 flex-1 px-6 py-8 md:px-10"><div className="max-w-5xl">
    <header className="flex flex-wrap items-start justify-between gap-5"><div><h1 className="text-[38px] font-semibold leading-none tracking-tight">{customModule.name}</h1>{customModule.description && <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">{customModule.description}</p>}</div><div className="flex items-center gap-3"><DeleteModuleButton moduleId={customModule.id} moduleName={customModule.name} itemCount={customModule.items.length} /><NewItemButton moduleId={customModule.id} linkOptions={linkOptions} /></div></header>
    {!customModule.items.length ? <div className="mt-16 rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-zinc-700" style={{ backgroundColor: `color-mix(in srgb, ${customModule.color} 10%, white)` }}><CustomModuleIcon name={customModule.icon} className="h-7 w-7" /></span><h2 className="mt-5 text-xl font-semibold">Nothing here yet.</h2><p className="mt-2 text-zinc-500">Create your first object to get started.</p></div> : <div className="mt-10 space-y-8">
      <ItemSection title="Items" items={activeItems} moduleId={customModule.id} color={customModule.color} icon={customModule.icon} />
      {archivedItems.length > 0 && <ItemSection title="Archived" items={archivedItems} moduleId={customModule.id} color={customModule.color} icon={customModule.icon} />}
    </div>}
  </div></section></div></main>;
}

type Item = NonNullable<Awaited<ReturnType<typeof getCustomModule>>>["items"][number];
function ItemSection({ title, items, moduleId, color, icon }: { title: string; items: Item[]; moduleId: string; color: string; icon: string }) {
  if (!items.length) return null;
  return <section><div className="mb-3 flex items-center gap-2"><h2 className="text-lg font-semibold">{title}</h2><span className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-xs font-semibold text-zinc-500">{items.length}</span></div><div className="space-y-3">{items.map((item) => <Link key={item.id} href={`/custom-modules/${moduleId}/items/${item.id}`} className="grid grid-cols-[44px_1fr_auto_24px] items-center gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md"><span className="flex h-11 w-11 items-center justify-center rounded-2xl text-zinc-700" style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}><CustomModuleIcon name={icon} className="h-5 w-5"/></span><div className="min-w-0"><h3 className="truncate font-semibold">{item.name}</h3><p className="mt-0.5 truncate text-sm text-zinc-500">{item.notes || (item.fields.length ? `${item.fields.length} custom field${item.fields.length === 1 ? "" : "s"}` : "No details added")}</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">{item.archived ? "Archived" : "Active"}</span><ChevronRight className="h-5 w-5 text-zinc-300"/></Link>)}</div></section>;
}
