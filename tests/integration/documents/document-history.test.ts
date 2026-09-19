import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), getCurrentUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createDocumentAction, updateDocumentAction } from "@/app/(app)/documents/actions";
import { getDocument } from "@/lib/data/documents";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";

/** KD-048 Phase 1 remainder: a Document's own field/status/archival changes enter the ObjectEvent history. */

const owner = "document-history-owner";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

async function makeDocument(id: string, extra: Record<string, unknown> = {}) {
  const objectId = `${id}-object`;
  await prisma.object.create({ data: { id: objectId, type: "DOCUMENT", userId: owner, name: id } });
  const document = await prisma.document.create({ data: { id, objectId, userId: owner, name: id, type: "Passport", status: "Active", owner: "Doc Owner", ...extra } });
  return { objectId, document };
}

const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a Document's own history (KD-048)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Doc", lastName: "Owner", preferredName: null });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Doc", lastName: "Owner", email: "document-history@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("createDocumentAction records ITEM_CREATED", async () => {
    await createDocumentAction({}, form({ name: "New passport", type: "Passport" }));
    const created = await prisma.document.findFirstOrThrow({ where: { userId: owner, name: "New passport" } });

    await expect(eventsOn(created.objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("updateDocumentAction records FIELD_CHANGED for named columns that actually changed", async () => {
    const { objectId, document } = await makeDocument("doc-fields");

    await updateDocumentAction(document.id, {}, form({
      name: "doc-fields", type: "Passport", updatedAt: document.updatedAt.toISOString(),
      documentNumber: "P1234567", country: "Australia",
    }));

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { eventType: "FIELD_CHANGED", fieldKey: "documentNumber", oldValue: null, newValue: "P1234567" },
      { eventType: "FIELD_CHANGED", fieldKey: "country", oldValue: null, newValue: "Australia" },
    ]);
  });

  it("updateDocumentAction records nothing when nothing actually changed", async () => {
    const { objectId, document } = await makeDocument("doc-unchanged", { documentNumber: "P1", country: "Australia" });

    await updateDocumentAction(document.id, {}, form({
      name: "doc-unchanged", type: "Passport", updatedAt: document.updatedAt.toISOString(),
      documentNumber: "P1", country: "Australia",
    }));

    await expect(eventsOn(objectId)).resolves.toEqual([]);
  });

  it("updateDocumentAction records ITEM_ARCHIVED/ITEM_RESTORED, not a generic FIELD_CHANGED, when archived flips", async () => {
    const { objectId, document } = await makeDocument("doc-archive");

    await updateDocumentAction(document.id, {}, form({
      name: "doc-archive", type: "Passport", updatedAt: document.updatedAt.toISOString(), archived: "true",
    }));
    // Archiving also independently flips the computed status to "Archived"
    // -- two real facts, both worth their own line, not one event standing
    // in for the other.
    await expect(eventsOn(objectId)).resolves.toMatchObject([
      { eventType: "ITEM_ARCHIVED" },
      { eventType: "STATUS_CHANGED", oldValue: "Active", newValue: "Archived" },
    ]);

    const archived = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    await updateDocumentAction(document.id, {}, form({
      name: "doc-archive", type: "Passport", updatedAt: archived.updatedAt.toISOString(), archived: "false",
    }));
    const events = await eventsOn(objectId);
    expect(events.slice(-2)).toMatchObject([
      { eventType: "ITEM_RESTORED" },
      { eventType: "STATUS_CHANGED", oldValue: "Archived", newValue: "Active" },
    ]);
    expect(events.filter((event) => event.eventType === "FIELD_CHANGED" && event.fieldKey === "archived")).toHaveLength(0);
  });

  it("updateDocumentAction records STATUS_CHANGED when a field edit moves the computed status", async () => {
    const { objectId, document } = await makeDocument("doc-status");

    // No expiry date -> Active; adding a past expiry date -> Expired, purely
    // as a side effect of the expiry date edit itself.
    await updateDocumentAction(document.id, {}, form({
      name: "doc-status", type: "Passport", updatedAt: document.updatedAt.toISOString(), expiryDate: "2020-01-01",
    }));

    const events = await eventsOn(objectId);
    expect(events).toContainEqual(expect.objectContaining({ eventType: "STATUS_CHANGED", oldValue: "Active", newValue: "Expired" }));
  });

  it("getDocument records a SYSTEM STATUS_CHANGED when a read finds the status has lapsed on its own", async () => {
    const { objectId } = await makeDocument("doc-lapsed", { expiryDate: new Date("2020-01-01T00:00:00.000Z"), status: "Active" });

    await getDocument("doc-lapsed");

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "STATUS_CHANGED", oldValue: "Active", newValue: "Expired", source: "SYSTEM" }]);
  });

  it("updateDocumentAction diffs the document's own ad-hoc custom fields", async () => {
    const { objectId, document } = await makeDocument("doc-custom-fields");
    const first = form({ name: "doc-custom-fields", type: "Passport", updatedAt: document.updatedAt.toISOString() });
    first.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify([{ label: "Renewal notes", type: "TEXT", value: "Call the embassy" }]));
    await updateDocumentAction(document.id, {}, first);
    const [created] = await prisma.objectField.findMany({ where: { objectId } });
    const afterFirst = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });

    const second = form({ name: "doc-custom-fields", type: "Passport", updatedAt: afterFirst.updatedAt.toISOString() });
    second.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify([{ id: created.id, label: "Renewal notes", type: "TEXT", value: "Already renewed" }]));
    await updateDocumentAction(document.id, {}, second);

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { eventType: "FIELD_CHANGED", fieldKey: created.id, oldValue: null, newValue: "Call the embassy" },
      { eventType: "FIELD_CHANGED", fieldKey: created.id, oldValue: "Call the embassy", newValue: "Already renewed" },
    ]);
  });
});
