import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { getKinesisLinkRecentEvents } from "@/lib/data/kinesis-links";

/**
 * The batched lookup behind a Kinesis Link card's own "sneak peek" -- the
 * single most recent ObjectEvent per linked object, in one query (Prisma's
 * `distinct` mapping to Postgres's DISTINCT ON), the same batched shape
 * getKinesisLinkPreviews already uses for the rich preview data.
 */

const owner = "recent-events-owner";
const stranger = "recent-events-stranger";

async function seedObject(id: string, userId: string) {
  await prisma.object.create({ data: { id, type: "GOAL", name: id, userId } });
}

describe.sequential("getKinesisLinkRecentEvents", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
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

  it("returns the single most recent event per object, not just any of its events", async () => {
    await seedObject("obj-a", owner);
    await prisma.objectEvent.createMany({ data: [
      { id: "event-a-old", userId: owner, objectId: "obj-a", eventType: "ITEM_CREATED", source: "USER", occurredAt: new Date("2026-01-01T00:00:00Z") },
      { id: "event-a-new", userId: owner, objectId: "obj-a", eventType: "FIELD_CHANGED", fieldKey: "amount", fieldLabel: "Savings", oldValue: "1000", newValue: "2000", source: "USER", occurredAt: new Date("2026-02-01T00:00:00Z") },
    ] });

    const events = await getKinesisLinkRecentEvents(["obj-a"]);

    expect(events["obj-a"]).toMatchObject({ title: "Savings Increased" });
  });

  it("carries the event's own before/after as `change`, for the card's own big-diff peek", async () => {
    await seedObject("obj-diff", owner);
    await prisma.objectEvent.create({ data: { id: "event-diff", userId: owner, objectId: "obj-diff", eventType: "FIELD_CHANGED", fieldKey: "amount", fieldLabel: "Savings", oldValue: "1000", newValue: "2000", source: "USER", occurredAt: new Date("2026-01-01T00:00:00Z") } });

    const events = await getKinesisLinkRecentEvents(["obj-diff"]);

    expect(events["obj-diff"]).toMatchObject({ change: { from: "$1,000", to: "$2,000", direction: "up" } });
  });

  it("carries a relationship event's `change` with its `kind`/`action`, for the peek's Link2/Unlink styling", async () => {
    await seedObject("obj-linked", owner);
    await seedObject("obj-target", owner);
    await prisma.objectEvent.create({ data: { id: "event-linked", userId: owner, objectId: "obj-linked", eventType: "RELATIONSHIP_ADDED", newRelationshipType: "DEPENDS_ON", inverse: false, relatedObjectId: "obj-target", relatedObjectName: "Save $30k", source: "USER", occurredAt: new Date("2026-01-01T00:00:00Z") } });

    const events = await getKinesisLinkRecentEvents(["obj-linked"]);

    expect(events["obj-linked"]).toMatchObject({ change: { from: "Depends on", to: "Save $30k", direction: "flat", kind: "relationship", action: "added" } });
  });

  it("omits `change` for an event with nothing to diff", async () => {
    await seedObject("obj-created", owner);
    await prisma.objectEvent.create({ data: { id: "event-created", userId: owner, objectId: "obj-created", eventType: "ITEM_CREATED", source: "USER", occurredAt: new Date("2026-01-01T00:00:00Z") } });

    const events = await getKinesisLinkRecentEvents(["obj-created"]);

    expect(events["obj-created"].change).toBeUndefined();
  });

  it("batches across several objects in one call, keyed by objectId", async () => {
    await seedObject("obj-b", owner);
    await seedObject("obj-c", owner);
    await prisma.objectEvent.createMany({ data: [
      { id: "event-b", userId: owner, objectId: "obj-b", eventType: "ITEM_CREATED", source: "USER", occurredAt: new Date("2026-01-01T00:00:00Z") },
      { id: "event-c", userId: owner, objectId: "obj-c", eventType: "ITEM_ARCHIVED", source: "USER", occurredAt: new Date("2026-01-02T00:00:00Z") },
    ] });

    const events = await getKinesisLinkRecentEvents(["obj-b", "obj-c"]);

    expect(events["obj-b"]).toMatchObject({ title: "Created" });
    expect(events["obj-c"]).toMatchObject({ title: "Archived" });
  });

  it("omits an id with no history at all, rather than an empty entry", async () => {
    await seedObject("obj-empty", owner);

    const events = await getKinesisLinkRecentEvents(["obj-empty"]);

    expect(events["obj-empty"]).toBeUndefined();
  });

  it("never returns another account's event, even for an id smuggled into the request", async () => {
    await seedObject("obj-theirs", stranger);
    await prisma.objectEvent.create({ data: { id: "event-theirs", userId: stranger, objectId: "obj-theirs", eventType: "ITEM_CREATED", source: "USER", occurredAt: new Date("2026-01-01T00:00:00Z") } });

    const events = await getKinesisLinkRecentEvents(["obj-theirs"]);

    expect(events["obj-theirs"]).toBeUndefined();
  });
});
