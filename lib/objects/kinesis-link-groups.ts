/**
 * Buckets a flat list of Kinesis Links by their resolved label -- "one flat
 * list, grouped by resolved label" (KD-049 §4), not separate outgoing/
 * "Referenced by" sections. Two links land in the same group only when they
 * read identically from the current Object's side (same label string); a
 * link stored as the inverse of one type and one stored as the forward
 * direction of a different type never collide just because they happen to
 * share a word.
 *
 * Order follows first appearance in the input, so a caller that already
 * sorts its links (oldest first, say) gets that same order reflected in
 * which group appears first.
 */
export function groupKinesisLinksByLabel<T extends { label: string }>(links: T[]): { label: string; links: T[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const link of links) {
    if (!buckets.has(link.label)) {
      buckets.set(link.label, []);
      order.push(link.label);
    }
    buckets.get(link.label)!.push(link);
  }
  return order.map((label) => ({ label, links: buckets.get(label)! }));
}
