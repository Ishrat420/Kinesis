import { notFound } from "next/navigation";
import { getFinanceItem } from "@/lib/data/finance";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { getKinesisLinkSection } from "@/lib/data/object-relationships";
import { addKinesisLinkAction, removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";
import { FinanceItemDetailView } from "../FinanceItemDetail";

export default async function FinanceItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const item = await getFinanceItem(itemId);

  // One answer for a missing record across every module -- see app/(app)/not-found.tsx.
  if (!item) notFound();

  // The item itself is left out of what it can link to.
  const [history, kinesisLinks, linkOptions] = await Promise.all([getObjectEvents(item.objectId), getKinesisLinkSection(item.objectId), getKinesisLinkOptions(item.objectId)]);
  return <FinanceItemDetailView item={item} history={history.map((event) => ({ id: event.id, title: event.title, detail: event.detail, occurredAt: event.occurredAt.toISOString() }))}
    kinesisLinks={kinesisLinks}
    linkOptions={linkOptions}
    addKinesisLinkAction={addKinesisLinkAction.bind(null, item.objectId)}
    updateKinesisLinkAction={updateKinesisLinkAction.bind(null, item.objectId)}
    removeKinesisLinkAction={removeKinesisLinkAction.bind(null, item.objectId)}
  />;
}
