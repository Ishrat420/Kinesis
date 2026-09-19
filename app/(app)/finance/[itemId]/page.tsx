import { notFound } from "next/navigation";
import { getFinanceItem } from "@/lib/data/finance";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { FinanceItemDetailView } from "../FinanceItemDetail";

export default async function FinanceItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const item = await getFinanceItem(itemId);

  // One answer for a missing record across every module -- see app/(app)/not-found.tsx.
  if (!item) notFound();

  const history = await getObjectEvents(item.objectId);
  return <FinanceItemDetailView item={item} history={history.map((event) => ({ id: event.id, title: event.title, detail: event.detail, occurredAt: event.occurredAt.toISOString() }))} />;
}
