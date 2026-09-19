import { notFound } from "next/navigation";
import { getFinanceItem } from "@/lib/data/finance";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { FinanceItemDetailView } from "@/app/(app)/finance/FinanceItemDetail";

/**
 * The intercepted version of ../../../finance/[itemId]/page.tsx -- clicking
 * a row on the Finance dashboard lands here instead, rendering the same
 * detail view as a "big window" over the still-mounted dashboard rather than
 * navigating away from it. Reached directly, by refresh, or by a shared
 * link, Next renders the real page in ../../../finance/[itemId]/page.tsx
 * instead; no interception happens there.
 */
export default async function FinanceItemModal({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const item = await getFinanceItem(itemId);

  if (!item) notFound();

  const history = await getObjectEvents(item.objectId);
  return <FinanceItemDetailView item={item} history={history.map((event) => ({ id: event.id, title: event.title, detail: event.detail, occurredAt: event.occurredAt.toISOString() }))} asModal />;
}
