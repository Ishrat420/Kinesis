import { notFound } from "next/navigation";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { getCustomItem } from "@/lib/data/custom-modules";
import { deleteCustomItemAction } from "../../../actions";
import { CustomItemDetailRecord } from "./EditCustomItemForm";
import { DeleteItemButton } from "./DeleteItemButton";
import { getKinesisLinkOptions, getKinesisLinkPreviews, getKinesisLinkRecentEvents } from "@/lib/data/kinesis-links";
import { getKinesisLinks } from "@/lib/data/object-relationships";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { ObjectHistory } from "@/components/history/ObjectHistory";
import { addKinesisLinkAction, removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";
import { formatDate } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";

export default async function CustomItemPage({ params }: { params: Promise<{ moduleId: string; itemId: string }> }) {
  const { moduleId, itemId } = await params;
  const [item, { locale, currency }] = await Promise.all([getCustomItem(moduleId, itemId), getFormatPreferences()]);
  if (!item) notFound();
  // Excludes this item's own object -- linking it to itself is never
  // meaningful, so the picker never offers the choice at all.
  const [linkOptions, kinesisLinks, history] = await Promise.all([getKinesisLinkOptions(item.objectId), getKinesisLinks(item.objectId), getObjectEvents(item.objectId)]);
  // Every object the picker could show, not just ones already linked --
  // choosing a new one in the picker, before saving, should show exactly
  // the card it'll actually render as (KD-042), not the compact fallback
  // until the next reload.
  const previews = await getKinesisLinkPreviews(linkOptions.map((option) => option.objectId));
  // Only the targets actually rendered as cards here need a sneak peek,
  // unlike `previews` above which also has to cover the picker's own
  // candidates: the item's own Kinesis Links, plus any template Kinesis
  // Link field's own targets (a separate set of cards ReadView renders too).
  const linkedObjectIds = [
    ...kinesisLinks.map((link) => link.target.objectId),
    ...item.templateFields.flatMap((field) => field.targetObjectIds ?? []),
  ];
  const recentEvents = await getKinesisLinkRecentEvents(linkedObjectIds);
  return <ModuleContent width="standard">
    <CustomItemDetailRecord
      moduleId={moduleId}
      item={{ id: item.id, name: item.name, archived: item.archived, templateId: item.templateId, templateFields: item.templateFields, fields: item.fields, updatedAt: item.updatedAt.toISOString() }}
      moduleName={item.module.name}
      moduleIcon={item.module.icon}
      moduleColor={item.module.color}
      linkOptions={linkOptions}
      previews={previews}
      recentEvents={recentEvents}
      locale={locale}
      currency={currency}
      deleteAction={<DeleteItemButton action={deleteCustomItemAction.bind(null, moduleId, item.id)} />}
      kinesisLinks={kinesisLinks}
      addKinesisLinkAction={addKinesisLinkAction.bind(null, item.objectId)}
      updateKinesisLinkAction={updateKinesisLinkAction.bind(null, item.objectId)}
      removeKinesisLinkAction={removeKinesisLinkAction.bind(null, item.objectId)}
    />
    <p className="mt-4 text-sm text-zinc-400">Created {formatDate(item.createdAt, locale)} · Updated {formatDate(item.updatedAt, locale)}</p>
    <div className="mt-6">
      <ObjectHistory entries={history.map((event) => ({ id: event.id, title: event.title, detail: event.detail, occurredAt: event.occurredAt.toISOString() }))} fallbackCreatedAt={item.createdAt.toISOString()} locale={locale} />
    </div>
  </ModuleContent>;
}
