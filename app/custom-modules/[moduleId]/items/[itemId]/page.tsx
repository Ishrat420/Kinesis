import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { getCustomItem } from "@/lib/data/custom-modules";
import { deleteCustomItemAction } from "../../../actions";
import { EditCustomItemForm } from "./EditCustomItemForm";
import { ActionSubmitButton } from "../../../ActionSubmitButton";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";

export default async function CustomItemPage({ params }: { params: Promise<{ moduleId: string; itemId: string }> }) {
  const { moduleId, itemId } = await params;
  const [item, linkOptions] = await Promise.all([getCustomItem(moduleId, itemId), getKinesisLinkOptions()]);
  if (!item) notFound();
  return <main className="min-h-screen bg-[#f7f8fb] text-zinc-950"><Topbar/><div className="flex"><Sidebar/><section className="min-w-0 flex-1 px-6 py-8 md:px-10"><div className="max-w-4xl">
    <Link href={`/custom-modules/${moduleId}`} className="mb-6 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"><ArrowLeft className="h-5 w-5"/> Back to {item.module.name}</Link>
    <header className="flex items-start justify-between gap-5"><div className="flex items-start gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-zinc-700" style={{ backgroundColor: `color-mix(in srgb, ${item.module.color} 10%, white)` }}><CustomModuleIcon name={item.module.icon} className="h-7 w-7"/></span><div><p className="text-sm font-medium text-zinc-400">{item.module.name}</p><h1 className="mt-1 text-[38px] font-semibold leading-none tracking-tight">{item.name}</h1></div></div><form action={deleteCustomItemAction.bind(null, moduleId, item.id)}><ActionSubmitButton tone="danger" idleLabel="Delete item" pendingLabel="Deleting…" /></form></header>
    <section className="mt-8 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><EditCustomItemForm moduleId={moduleId} item={{ id: item.id, name: item.name, notes: item.notes ?? "", reminder: item.reminder?.toISOString().slice(0, 10) ?? "", link: item.link ?? "", archived: item.archived, fields: item.fields }} linkOptions={linkOptions} /></section>
    <p className="mt-4 text-sm text-zinc-400">Created {item.createdAt.toLocaleDateString()} · Updated {item.updatedAt.toLocaleDateString()}</p>
  </div></section></div></main>;
}
