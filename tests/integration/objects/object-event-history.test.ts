import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { getObjectEvents, getRecentActivity } from "@/lib/data/object-event-history";

/**
 * KD-052 Phase 4's IGNORE tier -- the one significance level `getObjectEvents`
 * (an object's own plain History) actually filters, and the one place this
 * ticket changes pre-existing behaviour rather than only adding a new
 * consumer. `getRecentActivity` (the dashboard) is deliberately exempt --
 * it was never a Surface Score consumer to begin with (KD-052's own
 * "Destination thresholds") -- so both directions are worth locking in
 * here, not just the exclusion.
 */

const owner = "object-event-history-owner";

async function seedDocument(id: string) {
  await prisma.object.create({ data: { id, type: "DOCUMENT", name: id, userId: owner } });
  await prisma.document.create({
    data: { id, objectId: id, userId: owner, name: id, type: "Passport", status: "Active", owner: "Owner" },
  });
}

describe.sequential("getObjectEvents / getRecentActivity and the IGNORE tier (KD-052)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "History", lastName: "Owner", email: "object-event-history@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("excludes an IGNORE-tier field change from an object's own History, while keeping every other tier", async () => {
    await seedDocument("obj-history-doc");
    await prisma.objectEvent.createMany({ data: [
      // IGNORE: Document's own Issue date -- one of KD-052's three named IGNORE fieldKeys.
      { id: "event-history-ignore", userId: owner, objectId: "obj-history-doc", eventType: "FIELD_CHANGED", fieldKey: "issueDate", fieldLabel: "Issue date", oldValue: "2026-01-01", newValue: "2026-02-01", source: "USER" },
      // HIGH: Document's own Expiry date -- should still appear.
      { id: "event-history-high", userId: owner, objectId: "obj-history-doc", eventType: "FIELD_CHANGED", fieldKey: "expiryDate", fieldLabel: "Expiry date", oldValue: "2030-01-01", newValue: "2031-01-01", source: "USER" },
    ] });

    const events = await getObjectEvents("obj-history-doc");

    expect(events.map((event) => event.id)).toEqual(["event-history-high"]);
  });

  it("returns nothing for an object whose only history is IGNORE-tier, rather than an empty-looking but truthy fallback", async () => {
    await seedDocument("obj-history-ignore-only");
    await prisma.objectEvent.create({ data: { id: "event-history-ignore-only", userId: owner, objectId: "obj-history-ignore-only", eventType: "FIELD_CHANGED", fieldKey: "link", fieldLabel: "Link", oldValue: "https://old", newValue: "https://new", source: "USER" } });

    await expect(getObjectEvents("obj-history-ignore-only")).resolves.toEqual([]);
  });

  it("does NOT filter IGNORE-tier events out of Recent Activity -- deliberately exempt, unlike getObjectEvents", async () => {
    await seedDocument("obj-recent-activity-doc");
    await prisma.objectEvent.create({ data: { id: "event-recent-activity-ignore", userId: owner, objectId: "obj-recent-activity-doc", eventType: "FIELD_CHANGED", fieldKey: "issueDate", fieldLabel: "Issue date", oldValue: "2026-01-01", newValue: "2026-02-01", source: "USER" } });

    const activity = await getRecentActivity();

    expect(activity.map((item) => item.id)).toContain("event-recent-activity-ignore");
  });
});
