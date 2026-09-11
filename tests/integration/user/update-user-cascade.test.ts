import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { updateUserAction } from "@/app/(app)/user/actions";

/**
 * BUG-003 was a cascade left half-done: a removed measure surviving on
 * milestones that used it. `updateUserAction`'s own cascade -- renaming a
 * document's `owner` string when the account's display name changes -- is
 * the same shape of risk (two writes that have to land together, scoped
 * correctly, or a document is left crediting a name that no longer exists)
 * and had no coverage at all. These run against the real database because
 * what matters is exactly which rows the cascade touches afterward.
 */

const owner = "cascade-owner";
const otherOwner = "cascade-other-owner";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

async function makeDocument(id: string, userId: string, ownerName: string) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "DOCUMENT", name: id, userId } });
  await prisma.document.create({ data: { id, name: id, type: "Identity", status: "Valid", owner: ownerName, userId, objectId: object.id } });
}

const readOwner = (id: string) => prisma.document.findUniqueOrThrow({ where: { id }, select: { owner: true } }).then((doc) => doc.owner);
const readUser = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { preferredName: true } });

describe.sequential("updateUserAction's owner-rename cascade", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: [owner, otherOwner] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Jordan", lastName: "Rivers", email: "cascade-owner@example.test" },
        { id: otherOwner, firstName: "Jordan", lastName: "Other", email: "cascade-other@example.test" },
      ],
    });
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Jordan", lastName: "Rivers", preferredName: null });
  });

  it("renames every document credited to the account's old display name", async () => {
    await makeDocument("doc-old-name", owner, "Jordan");
    await updateUserAction({}, form({ preferredName: "J. Rivers" }));
    expect(await readOwner("doc-old-name")).toBe("J. Rivers");
    expect((await readUser(owner)).preferredName).toBe("J. Rivers");
  });

  it("also renames documents still crediting the legacy \"user\" placeholder", async () => {
    await makeDocument("doc-placeholder", owner, "user");
    await updateUserAction({}, form({ preferredName: "J. Rivers" }));
    expect(await readOwner("doc-placeholder")).toBe("J. Rivers");
  });

  it("leaves a document credited to an unrelated name untouched", async () => {
    await makeDocument("doc-unrelated", owner, "The Registrar's Office");
    await updateUserAction({}, form({ preferredName: "J. Rivers" }));
    expect(await readOwner("doc-unrelated")).toBe("The Registrar's Office");
  });

  it("does not rename another user's document, even sharing the same owner string", async () => {
    await makeDocument("doc-someone-elses", otherOwner, "Jordan");
    await updateUserAction({}, form({ preferredName: "J. Rivers" }));
    expect(await readOwner("doc-someone-elses")).toBe("Jordan");
  });

  it("falls back to the first name when the preferred name is cleared, and cascades to that", async () => {
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Jordan", lastName: "Rivers", preferredName: "J. Rivers" });
    await makeDocument("doc-clearing", owner, "J. Rivers");
    await updateUserAction({}, form({ preferredName: "" }));
    expect(await readOwner("doc-clearing")).toBe("Jordan");
    expect((await readUser(owner)).preferredName).toBeNull();
  });

  it("trims the submitted preferred name before storing and cascading it", async () => {
    await makeDocument("doc-trim", owner, "Jordan");
    await updateUserAction({}, form({ preferredName: "  J. Rivers  " }));
    expect((await readUser(owner)).preferredName).toBe("J. Rivers");
    expect(await readOwner("doc-trim")).toBe("J. Rivers");
  });
});
