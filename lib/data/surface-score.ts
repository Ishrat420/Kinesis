import type { ObjectRelationshipType } from "@prisma/client";
import { calculatePercentChange, classifyEventSignificance, type ClassifiableEvent } from "./object-events";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SIGNIFICANCE_BASE_SCORE = { high: 70, normal: 40 } as const;

/** KD-052 Phase 4 -- events older than this never qualify for scoring at all, regardless of tier. */
const FRESHNESS_ELIGIBILITY_DAYS = 90;

/**
 * KD-052 Phase 4 -- how much does an event's own age help or hurt its case
 * for being shown, for surfaces (the Kinesis Link peek) where recency
 * matters. `now` is passed in rather than read internally (`Date.now()`) so
 * every score stays reconstructable by hand and deterministic in tests.
 * Never returns `null` -- the separate >90-day exclusion lives in
 * `calculateEventSurfaceScore` below, since KD-052 states it as its own
 * eligibility criterion, not part of freshness's own number.
 */
export function calculateFreshnessScore(event: { occurredAt: Date }, now: Date): number {
  const ageDays = (now.getTime() - event.occurredAt.getTime()) / MS_PER_DAY;
  if (ageDays <= 14) return 30;
  if (ageDays <= 30) return 20;
  if (ageDays <= 60) return 0;
  return -30;
}

/**
 * KD-052 Phase 4 -- how relevant a change is when shown *through* a
 * specific Kinesis Link, i.e. is the object whose card is rendering
 * depended on by (or dependent on) the object this event happened to.
 * Driven purely by `linkType`, not by anything about the event itself --
 * `null` (no known relationship type, e.g. an object reached only through a
 * legacy template-defined Kinesis Link field rather than a real
 * `ObjectRelationship`) gets no boost, same as `RELATES_TO`/`CUSTOM`.
 */
export function calculateKinesisLinkRelevance(linkType: ObjectRelationshipType | null): number {
  switch (linkType) {
    case "BLOCKS":
    case "DEPENDS_ON":
      return 20;
    case "SUPPORTS":
    case "ALONGSIDE":
      return 10;
    default:
      return 0;
  }
}

/**
 * KD-052 Phase 4 -- Finance's `amount` field only, never applied to names,
 * notes, or other arbitrary text. Shares `calculatePercentChange`
 * (`object-events.ts`) with `classifyEventSignificance`'s own magnitude
 * dead zone gate, rather than each computing the percentage separately.
 */
export function calculateChangeMagnitude(event: { fieldKey: string | null; oldValue: string | null; newValue: string | null }): number {
  if (event.fieldKey !== "amount") return 0;
  const percent = calculatePercentChange(event);
  if (percent < 2) return 0;
  if (percent < 10) return 5;
  if (percent < 25) return 10;
  return 15;
}

/**
 * KD-052 Phase 4 -- the thin composer over the four functions above (plus
 * `classifyEventSignificance`, in `object-events.ts`): adds base
 * significance + freshness + Kinesis Link relevance + magnitude, and
 * nothing else. Returns `null` when the event doesn't qualify for scoring
 * at all -- IGNORE/LOW significance (gated before scoring: LOW can never
 * escape History purely through freshness or relevance), or older than the
 * 90-day eligibility window.
 */
export function calculateEventSurfaceScore(
  event: ClassifiableEvent & { occurredAt: Date },
  now: Date,
  linkType: ObjectRelationshipType | null,
): number | null {
  const significance = classifyEventSignificance(event);
  if (significance === "ignore" || significance === "low") return null;
  const ageDays = (now.getTime() - event.occurredAt.getTime()) / MS_PER_DAY;
  if (ageDays > FRESHNESS_ELIGIBILITY_DAYS) return null;
  return SIGNIFICANCE_BASE_SCORE[significance] + calculateFreshnessScore(event, now) + calculateKinesisLinkRelevance(linkType) + calculateChangeMagnitude(event);
}
