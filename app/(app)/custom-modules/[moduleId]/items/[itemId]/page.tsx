import { notFound } from "next/navigation";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { getCustomItem } from "@/lib/data/custom-modules";
import { deleteCustomItemAction } from "../../../actions";
import { CustomItemDetailRecord } from "./EditCustomItemForm";
import { DeleteItemButton } from "./DeleteItemButton";
import { getKinesisLinkOptions, getKinesisLinkPreviews } from "@/lib/data/kinesis-links";
import { formatDate } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";

export default async function CustomItemPage({ params }: { params: Promise<{ moduleId: string; itemId: string }> }) {
  const { moduleId, itemId } = await params;
  const [item, linkOptions, { locale, currency }] = await Promise.all([getCustomItem(moduleId, itemId), getKinesisLinkOptions(), getFormatPreferences()]);
  if (!item) notFound();
  const previewTargets = [
    ...item.templateFields.flatMap((field) => field.type === "KINESIS_LINK" ? field.targetObjectIds : []),
    ...item.fields.flatMap((field) => field.type === "KINESIS_LINK" ? field.targetObjectIds ?? [] : []),
  ];
  const previews = await getKinesisLinkPreviews(previewTargets);
  return <ModuleContent width="standard">
    <CustomItemDetailRecord
      moduleId={moduleId}
      item={{ id: item.id, name: item.name, archived: item.archived, templateId: item.templateId, templateFields: item.templateFields, fields: item.fields }}
      moduleName={item.module.name}
      moduleIcon={item.module.icon}
      moduleColor={item.module.color}
      linkOptions={linkOptions}
      previews={previews}
      locale={locale}
      currency={currency}
      deleteAction={<DeleteItemButton action={deleteCustomItemAction.bind(null, moduleId, item.id)} />}
    />
    <p className="mt-4 text-sm text-zinc-400">Created {formatDate(item.createdAt, locale)} · Updated {formatDate(item.updatedAt, locale)}</p>
  </ModuleContent>;
}
