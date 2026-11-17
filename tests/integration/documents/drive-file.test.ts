import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), redirect: vi.fn(), lookUp: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({
  requireKinesisUser: mocks.requireKinesisUser,
  getAuthenticatedClerkUser: async () => ({
    id: "user_clerk",
    externalAccounts: [{ provider: "oauth_google", approvedScopes: "openid https://www.googleapis.com/auth/drive.file", emailAddress: "me@example.com" }],
  }),
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUserOauthAccessToken: async () => ({ data: [{ token: "access-token" }] }) } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createDocumentAction } from "@/app/(app)/documents/actions";
import { attachDriveFileAction } from "@/app/(app)/documents/drive-actions";

/** KD-059: a document's file, kept in the owner's Google Drive. */

const owner = "drive-file-owner";
const stranger = "drive-file-stranger";
const FILE_ID = "1AbCdEfGhIjKlMnOp_q-r";
const found = (name = "Passport — scan.pdf") => ({
  status: "found",
  file: { id: FILE_ID, name, mimeType: "application/pdf", webViewLink: `https://drive.google.com/file/d/${FILE_ID}/view`, thumbnailLink: null, trashed: false },
});

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe.sequential("a document's Google Drive file (KD-059)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Drive", lastName: "Owner", preferredName: null });
    // Google itself is the only thing stubbed: each test says what Drive answers.
    vi.stubGlobal("fetch", async () => {
      const answer = await mocks.lookUp();
      return answer.status === "found"
        ? new Response(JSON.stringify(answer.file), { status: 200 })
        : new Response("{}", { status: 404 });
    });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.create({ data: { id: owner, firstName: "Drive", lastName: "Owner", email: "drive-owner@example.test" } });
    await prisma.user.create({ data: { id: stranger, firstName: "Some", lastName: "One", email: "drive-stranger@example.test" } });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("saves a new document with the file Drive confirmed, and notes it in History", async () => {
    mocks.lookUp.mockResolvedValue(found());
    await createDocumentAction({}, form({ name: "Passport", type: "Passport", driveFileId: FILE_ID }));

    const created = await prisma.document.findFirstOrThrow({ where: { userId: owner, name: "Passport" } });
    expect(created).toMatchObject({ driveFileId: FILE_ID, driveFileName: "Passport — scan.pdf", driveMimeType: "application/pdf" });
    expect(mocks.redirect).toHaveBeenCalledWith(`/documents/${created.id}`);
    const events = await prisma.objectEvent.findMany({ where: { objectId: created.objectId, fieldKey: "driveFile" } });
    expect(events).toMatchObject([{ eventType: "FIELD_CHANGED", fieldLabel: "File", oldValue: null, newValue: "Passport — scan.pdf" }]);
  });

  it("still saves the document when Drive can't confirm the file, and says so", async () => {
    mocks.lookUp.mockResolvedValue({ status: "missing" });
    await createDocumentAction({}, form({ name: "Licence", type: "Licence", driveFileId: FILE_ID }));

    const created = await prisma.document.findFirstOrThrow({ where: { userId: owner, name: "Licence" } });
    expect(created.driveFileId).toBeNull();
    expect(mocks.redirect).toHaveBeenCalledWith(`/documents/${created.id}?driveFile=1`);
  });

  it("replaces a file and keeps both names in History", async () => {
    mocks.lookUp.mockResolvedValue(found());
    await createDocumentAction({}, form({ name: "Policy", type: "Insurance", driveFileId: FILE_ID }));
    const created = await prisma.document.findFirstOrThrow({ where: { userId: owner, name: "Policy" } });

    mocks.lookUp.mockResolvedValue({ ...found("Policy — renewed.pdf"), file: { ...found().file, id: "2ZyXwVuTsRqPoNmL_k-j", name: "Policy — renewed.pdf" } });
    await expect(attachDriveFileAction(created.id, "2ZyXwVuTsRqPoNmL_k-j")).resolves.toEqual({ ok: true });

    await expect(prisma.document.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ driveFileId: "2ZyXwVuTsRqPoNmL_k-j", driveFileName: "Policy — renewed.pdf" });
    const events = await prisma.objectEvent.findMany({ where: { objectId: created.objectId, fieldKey: "driveFile" }, orderBy: { occurredAt: "asc" } });
    expect(events.map((event) => [event.oldValue, event.newValue])).toEqual([[null, "Passport — scan.pdf"], ["Passport — scan.pdf", "Policy — renewed.pdf"]]);
  });

  it("won't attach a file to someone else's document", async () => {
    const objectId = "drive-stranger-object";
    await prisma.object.create({ data: { id: objectId, type: "DOCUMENT", userId: stranger, name: "Theirs" } });
    await prisma.document.create({ data: { id: "drive-stranger-doc", objectId, userId: stranger, name: "Theirs", type: "Passport", status: "Active", owner: "Some One" } });
    mocks.lookUp.mockResolvedValue(found());

    await expect(attachDriveFileAction("drive-stranger-doc", FILE_ID)).resolves.toEqual({ error: "This document no longer exists." });
    await expect(prisma.document.findUniqueOrThrow({ where: { id: "drive-stranger-doc" } })).resolves.toMatchObject({ driveFileId: null });
  });

  it("the database refuses half a file record", async () => {
    mocks.lookUp.mockResolvedValue(found());
    await createDocumentAction({}, form({ name: "Card", type: "Passport" }));
    const created = await prisma.document.findFirstOrThrow({ where: { userId: owner, name: "Card" } });
    await expect(prisma.document.update({ where: { id: created.id }, data: { driveFileId: FILE_ID } })).rejects.toThrow(/Document_drive_file_all_or_none_check/);
  });
});
