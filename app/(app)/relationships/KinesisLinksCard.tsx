"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { KinesisLinkCard } from "@/components/custom-fields/KinesisLinkCard";
import type { KinesisLink } from "@/lib/data/object-relationships";
import { getPersonKinesisLinksAction } from "./actions";
import { InspectorDisclosure } from "./HistoryCard";

/**
 * A Person's Kinesis Links in the map's inspector -- the goals, documents and
 * other records that name them through a Kinesis Link field, which until now
 * could link *to* a person without the person ever showing it. Collapsed by
 * default in the same shell as History, since someone central to your life
 * can be linked from a long list of records. Read-only: a link is changed or
 * removed from the record that holds it, one click away on its card.
 *
 * Like `PersonHistoryCard`, a person not yet saved (`objectId` null) has
 * nothing to fetch, and the inspector is keyed by person id, so a switch of
 * person remounts this fresh rather than needing a reset.
 */
export function PersonKinesisLinksCard({ objectId }: { objectId: string | null }) {
  const [links, setLinks] = useState<KinesisLink[]>([]);

  useEffect(() => {
    if (!objectId) return;
    let cancelled = false;
    getPersonKinesisLinksAction(objectId).then((rows) => { if (!cancelled) setLinks(rows); });
    return () => { cancelled = true; };
  }, [objectId]);

  if (!objectId) return null;

  return (
    <InspectorDisclosure icon={Link2} title="Kinesis Links" count={links.length}>
      {links.length === 0
        ? <p className="text-[11px] text-zinc-400">Nothing is linked to this person yet.</p>
        : <div className="space-y-2">{links.map((link) => <KinesisLinkCard key={link.id} option={link.target} label={link.label} />)}</div>}
    </InspectorDisclosure>
  );
}
