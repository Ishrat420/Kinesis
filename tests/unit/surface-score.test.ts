import { describe, expect, it } from "vitest";
import type { ClassifiableEvent } from "@/lib/data/object-events";
import {
  calculateChangeMagnitude,
  calculateEventSurfaceScore,
  calculateFreshnessScore,
  calculateKinesisLinkRelevance,
} from "@/lib/data/surface-score";

const NOW = new Date("2026-06-15T00:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function event(overrides: Partial<ClassifiableEvent> & { occurredAt?: Date }): ClassifiableEvent & { occurredAt: Date } {
  return {
    eventType: "ITEM_CREATED",
    fieldKey: null,
    oldValue: null,
    newValue: null,
    oldRelationshipType: null,
    newRelationshipType: null,
    objectType: "DOCUMENT",
    occurredAt: NOW,
    ...overrides,
  };
}

describe("calculateFreshnessScore", () => {
  it("0-14 days is +30", () => {
    expect(calculateFreshnessScore({ occurredAt: NOW }, NOW)).toBe(30);
    expect(calculateFreshnessScore({ occurredAt: daysAgo(14) }, NOW)).toBe(30);
  });

  it("15-30 days is +20", () => {
    expect(calculateFreshnessScore({ occurredAt: daysAgo(15) }, NOW)).toBe(20);
    expect(calculateFreshnessScore({ occurredAt: daysAgo(30) }, NOW)).toBe(20);
  });

  it("31-60 days is +0", () => {
    expect(calculateFreshnessScore({ occurredAt: daysAgo(31) }, NOW)).toBe(0);
    expect(calculateFreshnessScore({ occurredAt: daysAgo(60) }, NOW)).toBe(0);
  });

  it("61-90 days is -30", () => {
    expect(calculateFreshnessScore({ occurredAt: daysAgo(61) }, NOW)).toBe(-30);
    expect(calculateFreshnessScore({ occurredAt: daysAgo(90) }, NOW)).toBe(-30);
  });
});

describe("calculateKinesisLinkRelevance", () => {
  it("Blocks and Depends on are +20", () => {
    expect(calculateKinesisLinkRelevance("BLOCKS")).toBe(20);
    expect(calculateKinesisLinkRelevance("DEPENDS_ON")).toBe(20);
  });

  it("Supports and Alongside are +10", () => {
    expect(calculateKinesisLinkRelevance("SUPPORTS")).toBe(10);
    expect(calculateKinesisLinkRelevance("ALONGSIDE")).toBe(10);
  });

  it("Related to and Custom are +0", () => {
    expect(calculateKinesisLinkRelevance("RELATES_TO")).toBe(0);
    expect(calculateKinesisLinkRelevance("CUSTOM")).toBe(0);
  });

  it("null (no known relationship type, e.g. a legacy template-field link) is +0", () => {
    expect(calculateKinesisLinkRelevance(null)).toBe(0);
  });
});

describe("calculateChangeMagnitude", () => {
  it("is +0 for anything other than Finance's amount field, even a large numeric-looking change", () => {
    expect(calculateChangeMagnitude({ fieldKey: "targetValue", oldValue: "100", newValue: "1000" })).toBe(0);
    expect(calculateChangeMagnitude({ fieldKey: null, oldValue: "100", newValue: "1000" })).toBe(0);
  });

  it("buckets amount's own percentage change: <2%=+0, 2-10%=+5, 10-25%=+10, >25%=+15", () => {
    expect(calculateChangeMagnitude({ fieldKey: "amount", oldValue: "1000", newValue: "1010" })).toBe(0);
    expect(calculateChangeMagnitude({ fieldKey: "amount", oldValue: "1000", newValue: "1050" })).toBe(5);
    expect(calculateChangeMagnitude({ fieldKey: "amount", oldValue: "1000", newValue: "1150" })).toBe(10);
    expect(calculateChangeMagnitude({ fieldKey: "amount", oldValue: "1000", newValue: "2000" })).toBe(15);
  });
});

describe("calculateEventSurfaceScore: the thin composer", () => {
  it("adds base significance + freshness + relevance + magnitude for a HIGH event", () => {
    // HIGH(70) + today(+30) + Depends on(+20) + 100% magnitude(+15) = 135, matching KD-052's own first worked example.
    const score = calculateEventSurfaceScore(
      event({ eventType: "FIELD_CHANGED", fieldKey: "amount", oldValue: "10000", newValue: "20000", occurredAt: NOW }),
      NOW,
      "DEPENDS_ON",
    );
    expect(score).toBe(135);
  });

  it("returns null for a LOW-significance event -- gated before scoring, never reaches a number", () => {
    const score = calculateEventSurfaceScore(
      event({ eventType: "FIELD_CHANGED", fieldKey: "notes", oldValue: "a", newValue: "b", occurredAt: NOW }),
      NOW,
      "DEPENDS_ON",
    );
    expect(score).toBeNull();
  });

  it("returns null for an IGNORE-significance event", () => {
    const score = calculateEventSurfaceScore(
      event({ eventType: "FIELD_CHANGED", fieldKey: "link", occurredAt: NOW }),
      NOW,
      null,
    );
    expect(score).toBeNull();
  });

  it("returns null for an event older than the 90-day eligibility window, however significant", () => {
    const score = calculateEventSurfaceScore(
      event({ eventType: "GOAL_COMPLETED", fieldKey: null, occurredAt: daysAgo(91) }),
      NOW,
      null,
    );
    expect(score).toBeNull();
  });

  it("still scores an event exactly at the 90-day boundary", () => {
    const score = calculateEventSurfaceScore(
      event({ eventType: "GOAL_COMPLETED", fieldKey: null, occurredAt: daysAgo(90) }),
      NOW,
      null,
    );
    // HIGH(70) + 61-90 day freshness(-30) + no relevance(+0) + no magnitude(+0) = 40.
    expect(score).toBe(40);
  });

  it("applies the magnitude dead zone through classifyEventSignificance -- a <2% amount change downgrades to NORMAL before freshness/relevance/magnitude are added", () => {
    // NORMAL(40, downgraded from HIGH) + today(+30) + Depends on(+20) + <2% magnitude(+0) = 90, matching KD-052's own daily-accrual worked example.
    const score = calculateEventSurfaceScore(
      event({ eventType: "FIELD_CHANGED", fieldKey: "amount", oldValue: "10000.00", newValue: "10004.32", occurredAt: NOW }),
      NOW,
      "DEPENDS_ON",
    );
    expect(score).toBe(90);
  });
});
