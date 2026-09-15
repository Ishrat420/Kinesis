import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { updateDocument } from "@/lib/data/documents";
import { isConflictRefusal, refusalOf } from "@/lib/actions/refusal";

/**
 * BUG-007: a save conditioned only on the document's id, not on the
 * `updatedAt` it was read at, silently overwrote whatever another tab (or a
 * long-open one) had changed in between -- a lost update. These run the real
 * `updateDocument` against a real database, since the bug (and its fix) lives
 * entirely in the write's own `WHERE` clause, not in anything a mock can
 * stand in for.
 */

const owner = "occ-document-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

async function makeDocument() {
  await prisma.object.create({ data: { id: "occ-doc-object", type: "DOCUMENT", userId: owner, name: "Passport" } });
  return prisma.document.create({
    data: { id: "occ-doc", objectId: "occ-doc-object", userId: owner, name: "Passport", type: "Passport", status: "Active", owner: "Occ Owner" },
  });
}

describe.sequential("updateDocument: optimistic concurrency", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Occ", lastName: "Owner", email: "occ-document-owner@example.test" } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  it("refuses a save whose expected updatedAt no longer matches the row", async () => {
    const document = await makeDocument();
    // Someone else's save, or an earlier save from the same owner in another
    // tab -- either way, the row has moved on since `document` was read.
    await prisma.document.update({ where: { id: document.id }, data: { notes: "changed elsewhere" } });

    const error = await updateDocument(document.id, { name: "Passport", type: "Passport", status: "Active" }, document.updatedAt).catch((thrown) => thrown);
    expect(refusalOf(error)).toBe("This document was changed elsewhere. Reload to see the latest version before saving again.");
    expect(isConflictRefusal(error)).toBe(true);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: document.id } })).resolves.toMatchObject({ notes: "changed elsewhere" });
  });

  it("saves cleanly and returns a fresh updatedAt when the expected stamp still matches", async () => {
    const document = await makeDocument();
    const result = await updateDocument(document.id, { name: "Passport renamed", type: "Passport", status: "Active" }, document.updatedAt);
    expect(result.name).toBe("Passport renamed");
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(document.updatedAt.getTime());
  });

  it("reports not-found rather than a conflict when the row was deleted out from under the save", async () => {
    const document = await makeDocument();
    await prisma.object.delete({ where: { id: "occ-doc-object" } });

    const error = await updateDocument(document.id, { name: "Passport", type: "Passport", status: "Active" }, document.updatedAt).catch((thrown) => thrown);
    expect(refusalOf(error)).toBe("This document no longer exists.");
    expect(isConflictRefusal(error)).toBe(false);
  });

  it("still allows a save whose expected stamp matches, after custom fields change on it", async () => {
    const document = await makeDocument();
    const first = await updateDocument(document.id, {
      name: "Passport", type: "Passport", status: "Active",
      customFields: [{ label: "Number", value: "X123", type: "TEXT" }],
    }, document.updatedAt);

    const second = await updateDocument(document.id, {
      name: "Passport", type: "Passport", status: "Active",
      customFields: [{ label: "Number", value: "X124", type: "TEXT" }],
    }, first.updatedAt);

    const fields = await prisma.objectField.findMany({ where: { objectId: "occ-doc-object" } });
    expect(fields).toEqual([expect.objectContaining({ label: "Number", value: "X124" })]);
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
  });
});
