import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getExpiringDocuments } from "@/lib/data/documents";

/**
 * KD-017 Phase 2: getExpiringDocuments now classifies through the shared
 * documentUpcomingPhase (Phase 1) instead of its own copy of the same
 * expiry math. This pins the behaviour that migration was supposed to
 * preserve exactly: archived documents stay excluded, an expired document
 * lands in `expired` (most-recently-expired first), one inside its
 * reminder window lands in `upcoming`, and one outside every window and
 * every archived document are left out of both.
 */

const owner = "expiring-soon-owner";

async function makeDocument(id: string, expiryDate: Date, prompt = 30, archived = false) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "DOCUMENT", name: id, userId: owner } });
  return prisma.document.create({ data: { id, objectId: object.id, userId: owner, name: id, type: "Identity", status: "Active", owner: "Owner", expiryDate, prompt, archived } });
}

describe.sequential("getExpiringDocuments", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Expiring", lastName: "Owner", email: "expiring-soon@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
  });

  it("sorts upcoming ascending and expired most-recently-expired first, excluding archived and out-of-window documents", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    await makeDocument("expired-recent", new Date("2026-06-10"), 30);
    await makeDocument("expired-old", new Date("2026-05-01"), 30);
    await makeDocument("due-soon", new Date("2026-06-25"), 30);
    await makeDocument("safe", new Date("2027-06-25"), 30);
    await makeDocument("archived-but-expired", new Date("2026-06-01"), 30, true);

    const { upcoming, expired } = await getExpiringDocuments(now);

    expect(upcoming.map((document) => document.id)).toEqual(["due-soon"]);
    expect(expired.map((document) => document.id)).toEqual(["expired-recent", "expired-old"]);
  });
});
