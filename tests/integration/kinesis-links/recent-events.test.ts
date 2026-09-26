import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), getToday: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/format/server", () => ({
  getFormatPreferences: async () => ({ locale: "en-AU", currency: "AUD", timeZone: "UTC" }),
  getToday: mocks.getToday,
}));

import { prisma } from "@/lib/data/prisma";
import { getKinesisLinkRecentEvents, type KinesisLinkRecentEventTarget } from "@/lib/data/kinesis-links";

/**
 * KD-052 Phase 4's wiring into the Kinesis Link card's own "sneak peek" --
 * classify -> gate (IGNORE excluded, LOW skipped) -> score -> threshold
 * (>= 50) -> pick the highest Surface Score, newest as a tiebreak, per
 * linked object's own recent event stream (not just its single newest
 * event, which is all the pre-KD-052 version of this function could ever
 * see -- see the ticket's corrected "What already exists" bullet).
 */

const owner = "recent-events-owner";
const stranger = "recent-events-stranger";
const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
// "Now" for every test below -- events are dated relative to this, not to
// wall-clock time, so the suite stays correct regardless of when it runs.
const NOW = at("2026-06-15");

async function seedObject(id: string, userId: string, type: "GOAL" | "DOCUMENT" = "GOAL") {
  await prisma.object.create({ data: { id, type, name: id, userId } });
}

/** A plain target with no known relationship type -- the common case in every test below that isn't specifically exercising relevance. */
const target = (objectId: string): KinesisLinkRecentEventTarget => ({ objectId, linkType: null });

describe.sequential("getKinesisLinkRecentEvents", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    mocks.getToday.mockResolvedValue(NOW);
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Recent", lastName: "Owner", email: "recent-events@example.test" },
        { id: stranger, firstName: "Some", lastName: "Stranger", email: "recent-events-stranger@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("returns an empty record for an empty request, without querying", async () => {
    await expect(getKinesisLinkRecentEvents([])).resolves.toEqual({});
  });

  it("picks the highest-scoring recent event, not just the most recent one", async () => {
    await seedObject("obj-a", owner);
    await prisma.objectEvent.createMany({ data: [
      // NORMAL (Category Changed = 40) but very fresh (0-14 days: +30) = 70.
      { id: "event-a-fresh-normal", userId: owner, objectId: "obj-a", eventType: "FIELD_CHANGED", fieldKey: "category", fieldLabel: "Category", oldValue: "Savings", newValue: "Investing", source: "USER", occurredAt: at("2026-06-14") },
      // HIGH (Balance Increased, >25% magnitude: +15) but older (15-30 days: +20) = 70+20+15 = 105 -- wins despite being less recent.
      { id: "event-a-older-high", userId: owner, objectId: "obj-a", eventType: "FIELD_CHANGED", fieldKey: "amount", fieldLabel: "Savings", oldValue: "1000", newValue: "2000", source: "USER", occurredAt: at("2026-05-25") },
    ] });

    const events = await getKinesisLinkRecentEvents([target("obj-a")]);

    expect(events["obj-a"]).toMatchObject({ title: "Savings Increased" });
  });

  it("carries the event's own before/after as `change`, for the card's own big-diff peek", async () => {
    await seedObject("obj-diff", owner);
    await prisma.objectEvent.create({ data: { id: "event-diff", userId: owner, objectId: "obj-diff", eventType: "FIELD_CHANGED", fieldKey: "amount", fieldLabel: "Savings", oldValue: "1000", newValue: "2000", source: "USER", occurredAt: at("2026-06-10") } });

    const events = await getKinesisLinkRecentEvents([target("obj-diff")]);

    expect(events["obj-diff"]).toMatchObject({ change: { from: "$1,000", to: "$2,000", direction: "up" } });
  });

  it("carries a relationship event's `change` with its `kind`/`action`/`icon`, for the peek's per-type styling", async () => {
    await seedObject("obj-linked", owner);
    await seedObject("obj-target", owner);
    await prisma.objectEvent.create({ data: { id: "event-linked", userId: owner, objectId: "obj-linked", eventType: "RELATIONSHIP_ADDED", newRelationshipType: "DEPENDS_ON", inverse: false, relatedObjectId: "obj-target", relatedObjectName: "Save $30k", source: "USER", occurredAt: at("2026-06-10") } });

    const events = await getKinesisLinkRecentEvents([{ objectId: "obj-linked", linkType: "DEPENDS_ON" }]);

    expect(events["obj-linked"]).toMatchObject({ change: { from: "Depends on", to: "Save $30k", direction: "flat", kind: "relationship", action: "added", icon: "depends-on" } });
  });

  it("renders a goal's own milestone events too (KD-051) -- they land on the goal's objectId same as any other event", async () => {
    await seedObject("obj-milestone-goal", owner);
    await prisma.objectEvent.create({ data: { id: "event-milestone-added", userId: owner, objectId: "obj-milestone-goal", eventType: "GOAL_MILESTONE_ADDED", fieldLabel: "Save deposit", newValue: "2030-06-01", source: "USER", occurredAt: at("2026-06-10") } });

    const events = await getKinesisLinkRecentEvents([target("obj-milestone-goal")]);

    expect(events["obj-milestone-goal"]).toMatchObject({ title: "Milestone added", detail: "Save deposit · Due 1 June 2030" });
  });

  it("omits `change` for an event with nothing to diff", async () => {
    await seedObject("obj-archived", owner);
    await prisma.objectEvent.create({ data: { id: "event-archived", userId: owner, objectId: "obj-archived", eventType: "ITEM_ARCHIVED", source: "USER", occurredAt: at("2026-06-10") } });

    const events = await getKinesisLinkRecentEvents([target("obj-archived")]);

    expect(events["obj-archived"].change).toBeUndefined();
  });

  it("batches across several objects in one call, keyed by objectId", async () => {
    await seedObject("obj-b", owner);
    await seedObject("obj-c", owner);
    await prisma.objectEvent.createMany({ data: [
      { id: "event-b", userId: owner, objectId: "obj-b", eventType: "STATUS_CHANGED", fieldKey: "status", fieldLabel: "Status", oldValue: "Active", newValue: "Archived", source: "USER", occurredAt: at("2026-06-10") },
      { id: "event-c", userId: owner, objectId: "obj-c", eventType: "ITEM_ARCHIVED", source: "USER", occurredAt: at("2026-06-11") },
    ] });

    const events = await getKinesisLinkRecentEvents([target("obj-b"), target("obj-c")]);

    expect(events["obj-b"]).toMatchObject({ title: "Status changed" });
    expect(events["obj-c"]).toMatchObject({ title: "Archived" });
  });

  it("omits an id with no history at all, rather than an empty entry", async () => {
    await seedObject("obj-empty", owner);

    const events = await getKinesisLinkRecentEvents([target("obj-empty")]);

    expect(events["obj-empty"]).toBeUndefined();
  });

  it("never returns another account's event, even for an id smuggled into the request", async () => {
    await seedObject("obj-theirs", stranger);
    await prisma.objectEvent.create({ data: { id: "event-theirs", userId: stranger, objectId: "obj-theirs", eventType: "ITEM_CREATED", source: "USER", occurredAt: at("2026-06-10") } });

    const events = await getKinesisLinkRecentEvents([target("obj-theirs")]);

    expect(events["obj-theirs"]).toBeUndefined();
  });

  it("never surfaces a LOW-significance event, no matter how fresh", async () => {
    await seedObject("obj-low", owner);
    await prisma.objectEvent.create({ data: { id: "event-low", userId: owner, objectId: "obj-low", eventType: "FIELD_CHANGED", fieldKey: "notes", fieldLabel: "Notes", oldValue: "old note", newValue: "new note", source: "USER", occurredAt: NOW } });

    const events = await getKinesisLinkRecentEvents([target("obj-low")]);

    expect(events["obj-low"]).toBeUndefined();
  });

  it("never surfaces an IGNORE-tier event, even as the only recent one", async () => {
    await seedObject("obj-ignore", owner, "DOCUMENT");
    await prisma.objectEvent.create({ data: { id: "event-ignore", userId: owner, objectId: "obj-ignore", eventType: "FIELD_CHANGED", fieldKey: "link", fieldLabel: "Link", oldValue: "https://old", newValue: "https://new", source: "USER", occurredAt: NOW } });

    const events = await getKinesisLinkRecentEvents([target("obj-ignore")]);

    expect(events["obj-ignore"]).toBeUndefined();
  });

  it("excludes an event older than the 90-day eligibility window, however significant", async () => {
    await seedObject("obj-stale", owner);
    await prisma.objectEvent.create({ data: { id: "event-stale", userId: owner, objectId: "obj-stale", eventType: "GOAL_COMPLETED", source: "USER", occurredAt: at("2026-03-01") } });

    const events = await getKinesisLinkRecentEvents([target("obj-stale")]);

    expect(events["obj-stale"]).toBeUndefined();
  });

  it("lets Kinesis Link relevance decide whether a borderline event clears the threshold", async () => {
    // NORMAL (40) + 31-60 day freshness (+0) = 40 alone, 60 with a Depends-on relevance boost (+20).
    await seedObject("obj-relevant", owner);
    await seedObject("obj-irrelevant", owner);
    const data = { eventType: "FIELD_CHANGED" as const, fieldKey: "category", fieldLabel: "Category", oldValue: "Savings", newValue: "Investing", source: "USER" as const, occurredAt: at("2026-05-01") };
    await prisma.objectEvent.createMany({ data: [
      { id: "event-relevant", userId: owner, objectId: "obj-relevant", ...data },
      { id: "event-irrelevant", userId: owner, objectId: "obj-irrelevant", ...data },
    ] });

    const events = await getKinesisLinkRecentEvents([
      { objectId: "obj-relevant", linkType: "DEPENDS_ON" },
      { objectId: "obj-irrelevant", linkType: "CUSTOM" },
    ]);

    expect(events["obj-relevant"]).toMatchObject({ title: "Category Changed" });
    expect(events["obj-irrelevant"]).toBeUndefined();
  });

  it("breaks a tied score by picking the newest event", async () => {
    // Both HIGH, same day -- freshness and base tier tie, so the later one (Restored) should win over the earlier one (Archived).
    await seedObject("obj-tie", owner);
    await prisma.objectEvent.createMany({ data: [
      { id: "event-tie-archived", userId: owner, objectId: "obj-tie", eventType: "ITEM_ARCHIVED", source: "USER", occurredAt: new Date("2026-06-10T09:00:00.000Z") },
      { id: "event-tie-restored", userId: owner, objectId: "obj-tie", eventType: "ITEM_RESTORED", source: "USER", occurredAt: new Date("2026-06-10T15:00:00.000Z") },
    ] });

    const events = await getKinesisLinkRecentEvents([target("obj-tie")]);

    expect(events["obj-tie"]).toMatchObject({ title: "Restored" });
  });
});
