import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createDocumentAction, updateDocumentAction, deleteDocumentTypeAction } from "@/app/(app)/documents/actions";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";
import { LINK_LIMIT } from "@/lib/validation/field-limits";

/**
 * The Documents module's server actions had no integration coverage at all --
 * only the data layer they call (updateDocument's own optimistic-concurrency
 * suite) and the redesigned form's UI. Everything the action wrapper itself
 * is responsible for -- form parsing/validation, resolving a document type on
 * the fly, mapping a save conflict to the `{error, conflict}` shape the form
 * reads, and Kinesis Link ownership checks -- ran against a real database for
 * the first time writing this file.
 */

const owner = "document-actions-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Doc", lastName: "Owner", preferredName: null });

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe.sequential("Documents server actions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Doc", lastName: "Owner", email: "document-actions@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  describe("createDocumentAction", () => {
    it("creates a document with the submitted fields and redirects to it", async () => {
      const result = await createDocumentAction({}, form({
        name: "Australian passport", type: "Passport", expiryDate: "2030-06-01", prompt: "180",
        documentNumber: "P1234567", country: "Australia",
      }));

      expect(result).toBeUndefined();
      const created = await prisma.document.findFirstOrThrow({ where: { name: "Australian passport" } });
      expect(created).toMatchObject({ type: "Passport", documentNumber: "P1234567", country: "Australia", prompt: 180 });
      expect(mocks.redirect).toHaveBeenCalledWith(`/documents/${created.id}`);
    });

    it("rejects a missing name or type without writing anything", async () => {
      const result = await createDocumentAction({}, form({ name: "", type: "Passport" }));
      expect(result).toEqual({ error: "Name and type are required." });
      await expect(prisma.document.findFirst({ where: { userId: owner } })).resolves.toBeNull();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("rejects an expiry date that only looks valid", async () => {
      const result = await createDocumentAction({}, form({ name: "Passport", type: "Passport", expiryDate: "2026-02-30" }));
      expect(result).toEqual({ error: "Enter a valid expiry date." });
    });

    /** KD-043 -- writing this at all confirms the length check actually runs before the database write, not after. */
    it("rejects a link over the link limit, without writing anything", async () => {
      const result = await createDocumentAction({}, form({ name: "Passport", type: "Passport", link: "https://example.com/" + "a".repeat(LINK_LIMIT) }));
      expect(result).toEqual({ error: expect.stringContaining("the link") });
      await expect(prisma.document.findFirst({ where: { userId: owner, name: "Passport" } })).resolves.toBeNull();
    });

    it("falls back to the default reminder when an unlisted prompt value is submitted", async () => {
      await createDocumentAction({}, form({ name: "Visa", type: "Visa", prompt: "999" }));
      const created = await prisma.document.findFirstOrThrow({ where: { name: "Visa" } });
      expect(created.prompt).toBe(180);
    });

    /**
     * resolveDocumentType creates a fresh DocumentType row the first time a
     * custom type is used, then reuses it (case-insensitively) on the next
     * document -- rather than creating a duplicate every save.
     */
    it("creates a custom document type on first use and reuses it case-insensitively next time", async () => {
      await createDocumentAction({}, form({ name: "Gym membership", type: "membership card" }));
      const firstType = await prisma.documentType.findFirstOrThrow({ where: { userId: owner } });
      expect(firstType.name).toBe("Membership card");

      await createDocumentAction({}, form({ name: "Library card", type: "MEMBERSHIP CARD" }));
      const types = await prisma.documentType.findMany({ where: { userId: owner } });
      expect(types).toHaveLength(1);
      const secondDocument = await prisma.document.findFirstOrThrow({ where: { name: "Library card" } });
      expect(secondDocument.type).toBe("Membership card");
    });

    it("refuses a Kinesis Link custom field pointed at an object the owner doesn't own", async () => {
      await prisma.user.deleteMany({ where: { id: "document-actions-stranger" } });
      await prisma.user.create({ data: { id: "document-actions-stranger", firstName: "S", lastName: "T", email: "doc-stranger@example.test" } });
      await prisma.object.create({ data: { id: "stranger-object", type: "GOAL", name: "Not yours", userId: "document-actions-stranger" } });

      const data = form({ name: "Passport", type: "Passport" });
      data.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify([{ label: "Related", type: "KINESIS_LINK", targetObjectIds: ["stranger-object"] }]));
      const result = await createDocumentAction({}, data);

      expect(result).toEqual({ error: "One of the linked items no longer exists. Reopen the link field and choose again." });
      await expect(prisma.document.findFirst({ where: { name: "Passport" } })).resolves.toBeNull();
      await prisma.user.deleteMany({ where: { id: "document-actions-stranger" } });
    });
  });

  describe("updateDocumentAction", () => {
    async function makeDocument() {
      await prisma.object.create({ data: { id: "update-doc-object", type: "DOCUMENT", userId: owner, name: "Passport" } });
      return prisma.document.create({ data: { id: "update-doc", objectId: "update-doc-object", userId: owner, name: "Passport", type: "Passport", status: "Active", owner: "Doc Owner" } });
    }

    it("updates the document and returns a fresh updatedAt on success", async () => {
      const document = await makeDocument();
      const result = await updateDocumentAction(document.id, {}, form({
        name: "Passport renamed", type: "Passport", updatedAt: document.updatedAt.toISOString(),
      }));

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      await expect(prisma.document.findUniqueOrThrow({ where: { id: document.id } })).resolves.toMatchObject({ name: "Passport renamed" });
    });

    /**
     * The regression this proves didn't happen: updateDocument's own conflict
     * refusal (a real thrown error) has to survive the action's try/catch and
     * come out the other side as `{error, conflict: true}` -- not rethrown as
     * an unhandled 500, and not silently swallowed into a generic message.
     */
    it("maps a real save conflict to {error, conflict: true} through the actual action", async () => {
      const document = await makeDocument();
      await prisma.document.update({ where: { id: document.id }, data: { notes: "changed elsewhere" } });

      const result = await updateDocumentAction(document.id, {}, form({
        name: "Passport", type: "Passport", updatedAt: document.updatedAt.toISOString(),
      }));

      expect(result).toEqual({ error: "This document was changed elsewhere. Reload to see the latest version before saving again.", conflict: true });
      await expect(prisma.document.findUniqueOrThrow({ where: { id: document.id } })).resolves.toMatchObject({ notes: "changed elsewhere", name: "Passport" });
    });

    it("refuses a missing or unparseable updatedAt rather than skipping the concurrency check", async () => {
      const document = await makeDocument();
      const result = await updateDocumentAction(document.id, {}, form({ name: "Passport", type: "Passport" }));
      expect(result).toEqual({ error: "This document could not be identified. Reload and try again." });
    });
  });

  describe("deleteDocumentTypeAction", () => {
    it("deletes a custom type that's no longer in use", async () => {
      await prisma.documentType.create({ data: { id: crypto.randomUUID(), userId: owner, name: "Unused Type" } });
      const result = await deleteDocumentTypeAction("Unused Type");
      expect(result).toEqual({});
      await expect(prisma.documentType.findFirst({ where: { userId: owner, name: "Unused Type" } })).resolves.toBeNull();
    });

    it("refuses to delete a type that's still used by a document", async () => {
      await createDocumentAction({}, form({ name: "Passport", type: "Custom In Use" }));
      const result = await deleteDocumentTypeAction("Custom In Use");
      expect(result).toEqual({ error: "This type is being used by a document." });
      await expect(prisma.documentType.findFirst({ where: { userId: owner, name: "Custom In Use" } })).resolves.not.toBeNull();
    });

    it("refuses to delete a default document type", async () => {
      const result = await deleteDocumentTypeAction("Passport");
      expect(result).toEqual({ error: "Default document types cannot be deleted." });
    });
  });
});
