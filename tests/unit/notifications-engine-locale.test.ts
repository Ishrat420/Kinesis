import { describe, expect, it, vi } from "vitest";

// The engine reaches Prisma when it reconciles, but the candidate builders are
// pure; the client is stubbed so they can be exercised without a database.
vi.mock("@/lib/data/prisma", () => ({ prisma: {} }));

const { getDocumentNotificationCandidate } = await import("@/lib/notifications/engine");

const expiredDocument = {
  id: "document-1",
  name: "Passport",
  type: "Passport",
  expiryDate: new Date("2026-03-09T00:00:00.000Z"),
  prompt: 180,
};
const now = new Date("2026-03-20T00:00:00.000Z");

describe("expired document notifications", () => {
  it("writes the expiry date using the supplied locale", () => {
    // The cron evaluates every user in one process, so the locale is an
    // argument rather than request-scoped state.
    expect(getDocumentNotificationCandidate(expiredDocument, now, true, "en-AU")?.message)
      .toContain("9 Mar 2026");
    expect(getDocumentNotificationCandidate(expiredDocument, now, true, "en-US")?.message)
      .toContain("Mar 9, 2026");
  });

  it("falls back to the default locale when none is supplied", () => {
    const candidate = getDocumentNotificationCandidate(expiredDocument, now);
    expect(candidate?.type).toBe("EXPIRED");
    expect(candidate?.message).toContain("9 Mar 2026");
  });

  it("keeps the stored expiry date in UTC so it never shifts a day", () => {
    expect(getDocumentNotificationCandidate(expiredDocument, now)?.expiryDate.toISOString())
      .toBe("2026-03-09T00:00:00.000Z");
  });
});
