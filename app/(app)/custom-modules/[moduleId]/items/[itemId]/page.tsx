import { notFound } from "next/navigation";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { getCustomItem } from "@/lib/data/custom-modules";
import { deleteCustomItemAction } from "../../../actions";
import { EditCustomItemForm } from "./EditCustomItemForm";
import { ActionSubmitButton } from "../../../ActionSubmitButton";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";
import { formatDate } from "@/lib/dates";

export default async function CustomItemPage({ params }: { params: Promise<{ moduleId: string; itemId: string }> }) {
  const { moduleId, itemId } = await params;
  const [item, linkOptions] = await Promise.all([getCustomItem(moduleId, itemId), getKinesisLinkOptions()]);
  if (!item) notFound();
  return <ModuleContent width="standard">
    <ModuleHeader
      backHref={`/custom-modules/${moduleId}`}
      backLabel={`Back to ${item.module.name}`}
      breadcrumbs={[{ label: item.module.name, href: `/custom-modules/${moduleId}` }, { label: item.name }]}
      title={item.name}
      icon={<CustomModuleIcon name={item.module.icon} className="h-6 w-6"/>}
      iconClassName="text-zinc-700"
      iconStyle={{ backgroundColor: `color-mix(in srgb, ${item.module.color} 10%, white)` }}
      actions={<form action={deleteCustomItemAction.bind(null, moduleId, item.id)}><ActionSubmitButton tone="danger" idleLabel="Delete item" pendingLabel="Deleting…" /></form>}
    />
    <section className="mt-8 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><EditCustomItemForm moduleId={moduleId} item={{ id: item.id, name: item.name, notes: item.notes ?? "", reminder: item.reminder?.toISOString().slice(0, 10) ?? "", link: item.link ?? "", archived: item.archived, fields: item.fields }} linkOptions={linkOptions} /></section>
    <p className="mt-4 text-sm text-zinc-400">Created {formatDate(item.createdAt)} · Updated {formatDate(item.updatedAt)}</p>
  </ModuleContent>;
}
