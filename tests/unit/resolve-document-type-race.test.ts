import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: { documentType: { findFirst: mocks.findFirst, create: mocks.create } },
}));

import { resolveDocumentType } from "@/lib/data/documents";

/**
 * Same bug as `ensureStarterTemplate` (lib/data/starter-template.ts), found
 * by auditing the codebase for the same pattern once that one was fixed:
 * this find-then-create races `DocumentType`'s `@@unique([userId, name])`
 * with no lock, no transaction. Two document saves introducing the same
 * brand-new custom type from two tabs can both miss the `findFirst` and
 * both reach `create`; the loser must resolve quietly, not crash that save.
 *
 * Driven with a mocked client rather than a real race, for the same reason
 * as the starter-template fix: two real JS promises racing against Postgres
 * don't reliably force the underlying queries to overlap, so a from-scratch
 * concurrency test proves nothing either way.
 */
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireKinesisUser.mockResolvedValue({ id: "owner-1" });
});

describe("resolveDocumentType: losing the create race", () => {
  // "Warranty" is deliberately not one of DEFAULT_DOCUMENT_TYPES -- a
  // default type short-circuits before this function ever reaches the
  // find-then-create logic under test (see the early return above the
  // `findFirst` call).
  it("reads back whichever casing won, rather than crashing the save", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(null) // the initial "does it exist" check
      .mockResolvedValueOnce({ name: "Warranty" }); // re-read after losing the race
    mocks.create.mockRejectedValue({ code: "P2002", message: "Unique constraint failed" });

    await expect(resolveDocumentType("warranty")).resolves.toBe("Warranty");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });

  it("falls back to the formatted value if the winner's row somehow can't be read back", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockRejectedValue({ code: "P2002", message: "Unique constraint failed" });

    await expect(resolveDocumentType("warranty")).resolves.toBe("Warranty");
  });

  it("still rethrows any other error, rather than swallowing every failure", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockRejectedValue(new Error("connection reset"));

    await expect(resolveDocumentType("warranty")).rejects.toThrow("connection reset");
  });
});
