import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createDocumentAction, renewDocumentAction, updateDocumentAction } from "@/app/(app)/documents/actions";
import { getCalendarItems } from "@/lib/data/calendar";
import { getToday } from "@/lib/format/server";
import { recurrenceFromColumns } from "@/lib/recurrence";
import { getDocuments } from "@/lib/data/documents";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { collectNotifications } from "@/lib/data/notification-collection";
import { getUpcomingAndDue } from "@/lib/data/upcoming";
import { dismissAttentionItem } from "@/app/actions";
import { addUtcDays, formatDateInput } from "@/lib/dates";

/**
 * KD-056: a document's expiry date renewing on a schedule, end to end against
 * a real database -- creating and editing through the real actions, "Mark
 * renewed" and its History (DOCUMENT_RENEWED), conflicts, the calendar's
 * projection, and the migration's check constraints.
 */

const owner = "recurring-document-owner";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const renewing = (name: string, expiryDate: string, recurrenceRule: string, recurrenceDays = "") =>
  form({ name, type: "Vehicle", expiryDate, repeat: "on", recurrenceRule, recurrenceDays });

const onlyDocument = () => prisma.document.findFirstOrThrow({ where: { userId: owner } });
const events = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a renewing document", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Renewing", lastName: "Owner", preferredName: null });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Renewing", lastName: "Owner", email: "recurring-document@example.test" } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  describe("creating", () => {
    it("stores the rule with its anchor day beside the expiry date", async () => {
      await createDocumentAction({}, renewing("Car registration", "2099-01-31", "YEARLY"));
      expect(recurrenceFromColumns(await onlyDocument())).toEqual({ rule: "YEARLY", days: null, anchorDay: 31 });
    });

    it("stays a one-off when the repeat button is off", async () => {
      await createDocumentAction({}, form({ name: "Passport", type: "Passport", expiryDate: "2099-01-31", repeat: "", recurrenceRule: "YEARLY" }));
      expect(recurrenceFromColumns(await onlyDocument())).toBeNull();
    });

    it("refuses renewing with no expiry date, no rule, or a bad N -- in renewal words", async () => {
      await expect(createDocumentAction({}, renewing("Car registration", "", "YEARLY"))).resolves.toEqual({ error: "Pick an expiry date for a document that renews." });
      await expect(createDocumentAction({}, renewing("Car registration", "2099-01-31", ""))).resolves.toEqual({ error: "Pick how often it renews." });
      await expect(createDocumentAction({}, renewing("Gym pass", "2099-01-31", "EVERY_N_DAYS", "0"))).resolves.toEqual({ error: "N must be a whole number from 1 to 999." });
      await expect(prisma.document.count({ where: { userId: owner } })).resolves.toBe(0);
    });
  });

  describe("marking it renewed", () => {
    it("moves the expiry on, updates the status, and records Renewed with the old and new expiry", async () => {
      await createDocumentAction({}, renewing("Car registration", "2099-01-31", "MONTHLY"));
      const document = await onlyDocument();

      await expect(renewDocumentAction(document.id, "2099-01-31")).resolves.toMatchObject({ expiryDate: "2099-02-28" });
      await expect(renewDocumentAction(document.id, "2099-02-28")).resolves.toMatchObject({ expiryDate: "2099-03-31" });

      const renewed = await onlyDocument();
      expect(renewed).toMatchObject({ expiryDate: d("2099-03-31"), status: "Active", recurrenceAnchorDay: 31 });
      expect((await events(document.objectId)).map(({ eventType, oldValue, newValue }) => ({ eventType, oldValue, newValue }))).toEqual([
        { eventType: "ITEM_CREATED", oldValue: null, newValue: null },
        { eventType: "DOCUMENT_RENEWED", oldValue: "2099-01-31", newValue: "2099-02-28" },
        { eventType: "DOCUMENT_RENEWED", oldValue: "2099-02-28", newValue: "2099-03-31" },
      ]);
    });

    it("refuses a stale or repeated click as a conflict instead of renewing twice", async () => {
      await createDocumentAction({}, renewing("Car registration", "2099-01-31", "YEARLY"));
      const document = await onlyDocument();
      await renewDocumentAction(document.id, "2099-01-31");

      await expect(renewDocumentAction(document.id, "2099-01-31")).resolves.toMatchObject({ conflict: true });
      expect((await onlyDocument()).expiryDate).toEqual(d("2100-01-31"));
    });

    it("catches a long-lapsed document up to today or later, and it is no longer expired", async () => {
      await createDocumentAction({}, renewing("Gym pass", "2000-01-03", "WEEKLY"));
      const document = await onlyDocument();
      expect(document.status).toBe("Expired");
      const today = await getToday();

      const result = await renewDocumentAction(document.id, "2000-01-03");

      const next = d(result.expiryDate!);
      expect(next.getTime()).toBeGreaterThanOrEqual(today.getTime());
      expect(next.getTime() - today.getTime()).toBeLessThan(7 * 86_400_000);
      expect((await onlyDocument()).status).not.toBe("Expired");
    });

    it("refuses a one-off document and an archived one", async () => {
      await createDocumentAction({}, form({ name: "Passport", type: "Passport", expiryDate: "2099-01-31" }));
      const oneOff = await onlyDocument();
      await expect(renewDocumentAction(oneOff.id, "2099-01-31")).resolves.toEqual({ error: "This document doesn't renew. Edit it to set how often it renews." });

      await prisma.document.update({ where: { id: oneOff.id }, data: { recurrence: "YEARLY", recurrenceAnchorDay: 31, archived: true } });
      await expect(renewDocumentAction(oneOff.id, "2099-01-31")).resolves.toEqual({ error: "Restore this document before renewing it." });
      expect((await onlyDocument()).expiryDate).toEqual(d("2099-01-31"));
    });

    it("moves updatedAt on, so an edit opened before renewing is refused as stale", async () => {
      await createDocumentAction({}, renewing("Car registration", "2099-01-31", "YEARLY"));
      const document = await onlyDocument();
      const renewed = await renewDocumentAction(document.id, "2099-01-31");

      const stale = await updateDocumentAction(document.id, {}, form({ name: "Car registration", type: "Vehicle", expiryDate: "2099-01-31", updatedAt: document.updatedAt.toISOString() }));
      expect(stale).toMatchObject({ conflict: true });
      const fresh = await updateDocumentAction(document.id, {}, form({ name: "Car registration", type: "Vehicle", expiryDate: "2100-01-31", repeat: "on", recurrenceRule: "YEARLY", updatedAt: renewed.updatedAt! }));
      expect(fresh).toMatchObject({ success: true });
    });
  });

  describe("editing", () => {
    it("records a Renews change, keeps the anchor on an unchanged re-save, and clears the rule with the date", async () => {
      await createDocumentAction({}, renewing("Lease", "2099-01-31", "MONTHLY"));
      let document = await onlyDocument();
      await renewDocumentAction(document.id, "2099-01-31");
      document = await onlyDocument();

      // Re-saving the clamped 28 Feb unchanged keeps the 31st as its anchor.
      await updateDocumentAction(document.id, {}, form({ name: "Lease", type: "Vehicle", expiryDate: "2099-02-28", repeat: "on", recurrenceRule: "MONTHLY", updatedAt: document.updatedAt.toISOString() }));
      document = await onlyDocument();
      expect(document.recurrenceAnchorDay).toBe(31);

      await updateDocumentAction(document.id, {}, form({ name: "Lease", type: "Vehicle", expiryDate: "2099-02-28", repeat: "on", recurrenceRule: "YEARLY", updatedAt: document.updatedAt.toISOString() }));
      document = await onlyDocument();
      await updateDocumentAction(document.id, {}, form({ name: "Lease", type: "Vehicle", expiryDate: "", updatedAt: document.updatedAt.toISOString() }));
      document = await onlyDocument();
      expect(recurrenceFromColumns(document)).toBeNull();

      const renewsChanges = (await events(document.objectId)).filter((event) => event.fieldKey === "recurrence");
      expect(renewsChanges.map(({ fieldLabel, oldValue, newValue }) => ({ fieldLabel, oldValue, newValue }))).toEqual([
        { fieldLabel: "Renews", oldValue: "Every month", newValue: "Every year" },
        { fieldLabel: "Renews", oldValue: "Every year", newValue: null },
      ]);
    });
  });

  describe("the calendar", () => {
    it("projects later expiries with the repeat icon; only the current one has a reminder pin", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC" } });
      await createDocumentAction({}, form({ name: "Rego", type: "Vehicle", expiryDate: "2099-01-31", prompt: "30", repeat: "on", recurrenceRule: "MONTHLY" }));
      const document = await onlyDocument();

      const window = await getCalendarItems(d("2098-12-28"), new Date("2099-03-08T23:59:59.999Z"));
      const mine = window.filter((entry) => entry.sourceObjectId === document.id);
      expect(mine.map(({ id, date, recurring, sourceType }) => ({ id, date, recurring, sourceType }))).toEqual([
        { id: `document-reminder-${document.id}`, date: "2099-01-01", recurring: undefined, sourceType: "REMINDER" },
        { id: `document-${document.id}`, date: "2099-01-31", recurring: true, sourceType: "DOCUMENT" },
        { id: `document-${document.id}-2099-02-28`, date: "2099-02-28", recurring: true, sourceType: "DOCUMENT" },
      ]);
    });
  });

  describe("the database", () => {
    it("refuses a rule with no expiry date, or a rule missing its N or anchor", async () => {
      await createDocumentAction({}, renewing("Rego", "2099-01-31", "YEARLY"));
      const document = await onlyDocument();
      await expect(prisma.document.update({ where: { id: document.id }, data: { expiryDate: null } })).rejects.toThrow();
      await expect(prisma.document.update({ where: { id: document.id }, data: { recurrence: "EVERY_N_DAYS" } })).rejects.toThrow();
      await expect(prisma.document.update({ where: { id: document.id }, data: { recurrence: "MONTHLY", recurrenceAnchorDay: null } })).rejects.toThrow();
    });
  });

  describe("History", () => {
    it("reads Renewed with the old and new expiry, newest first", async () => {
      await createDocumentAction({}, renewing("Car registration", "2099-01-31", "YEARLY"));
      const document = await onlyDocument();
      await renewDocumentAction(document.id, "2099-01-31");

      const [latest] = await getObjectEvents(document.objectId);
      expect(latest.title).toBe("Renewed");
      expect(latest.detail).toMatch(/^Expiry moved from 31 Jan(uary)? 2099 to 31 Jan(uary)? 2100$/);
    });

    it("records no status line of its own -- not when renewing, nor when a page next syncs statuses", async () => {
      const today = await getToday();
      // Ten days out with a 30-day reminder: "Expiring soon" until renewed.
      const expiry = formatDateInput(addUtcDays(today, 10));
      await createDocumentAction({}, form({ name: "Car registration", type: "Vehicle", expiryDate: expiry, prompt: "30", repeat: "on", recurrenceRule: "YEARLY" }));
      const document = await onlyDocument();
      expect(document.status).toBe("Expiring soon");

      await renewDocumentAction(document.id, expiry);
      await getDocuments(); // syncs every stored status with today

      expect((await onlyDocument()).status).toBe("Active");
      expect((await events(document.objectId)).map((event) => event.eventType)).toEqual(["ITEM_CREATED", "DOCUMENT_RENEWED"]);
    });

    it("records turning renewing on for an existing one-off document", async () => {
      await createDocumentAction({}, form({ name: "Insurance", type: "Insurance", expiryDate: "2099-06-30" }));
      const document = await onlyDocument();
      await updateDocumentAction(document.id, {}, form({ name: "Insurance", type: "Insurance", expiryDate: "2099-06-30", repeat: "on", recurrenceRule: "EVERY_N_DAYS", recurrenceDays: "90", updatedAt: document.updatedAt.toISOString() }));

      expect(await onlyDocument()).toMatchObject({ recurrence: "EVERY_N_DAYS", recurrenceDays: 90, recurrenceAnchorDay: null });
      expect((await events(document.objectId)).find((event) => event.fieldKey === "recurrence")).toMatchObject({ fieldLabel: "Renews", oldValue: null, newValue: "Every 90 days" });
    });
  });

  describe("schedules", () => {
    it("renews every N days from the current expiry, not from today", async () => {
      await createDocumentAction({}, renewing("Gym pass", "2099-01-01", "EVERY_N_DAYS", "45"));
      const document = await onlyDocument();
      await expect(renewDocumentAction(document.id, "2099-01-01")).resolves.toMatchObject({ expiryDate: "2099-02-15" });
      await expect(renewDocumentAction(document.id, "2099-02-15")).resolves.toMatchObject({ expiryDate: "2099-04-01" });
    });

    it("keeps a 29 February anchor across non-leap years", async () => {
      await createDocumentAction({}, renewing("Licence", "2096-02-29", "YEARLY"));
      const document = await onlyDocument();
      await expect(renewDocumentAction(document.id, "2096-02-29")).resolves.toMatchObject({ expiryDate: "2097-02-28" });
      await expect(renewDocumentAction(document.id, "2097-02-28")).resolves.toMatchObject({ expiryDate: "2098-02-28" });
      expect((await onlyDocument()).recurrenceAnchorDay).toBe(29);
    });
  });

  describe("notifications and dismissals", () => {
    it("notify afresh for the renewed expiry, under a new key", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC" } });
      const today = await getToday();
      const expiry = formatDateInput(addUtcDays(today, 5));
      await createDocumentAction({}, form({ name: "Parking permit", type: "Permit", expiryDate: expiry, prompt: "30", repeat: "on", recurrenceRule: "EVERY_N_DAYS", recurrenceDays: "10" }));
      const document = await onlyDocument();
      const documentNotes = async () => (await collectNotifications(owner)).filter((note) => note.source === "document");

      const before = await documentNotes();
      expect(before.map((note) => formatDateInput(note.expiryDate!))).toEqual([expiry]);

      await renewDocumentAction(document.id, expiry);

      const after = await documentNotes();
      expect(after.map((note) => formatDateInput(note.expiryDate!))).toEqual([formatDateInput(addUtcDays(today, 15))]);
      expect(after[0].key).not.toBe(before[0].key);
    });

    it("a dismissal hides only the expiry it was made on; the renewed one shows again", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC" } });
      const today = await getToday();
      const expiry = formatDateInput(addUtcDays(today, 5));
      await createDocumentAction({}, form({ name: "Parking permit", type: "Permit", expiryDate: expiry, prompt: "30", repeat: "on", recurrenceRule: "EVERY_N_DAYS", recurrenceDays: "10" }));
      const document = await onlyDocument();
      const mine = async () => (await getUpcomingAndDue()).filter((item) => item.kind === "document" && item.id === `document-${document.id}`);

      const [shown] = await mine();
      expect(shown).toBeDefined();
      await dismissAttentionItem((shown as { dismissKey: string }).dismissKey);
      await expect(mine()).resolves.toEqual([]);

      await renewDocumentAction(document.id, expiry);
      await expect(mine()).resolves.toHaveLength(1);
    });
  });

  describe("the calendar's limits", () => {
    it("draws nothing before the current expiry, and nothing at all once archived", async () => {
      await createDocumentAction({}, renewing("Rego", "2099-01-31", "MONTHLY"));
      const document = await onlyDocument();
      const before = await getCalendarItems(d("2098-11-01"), new Date("2098-12-31T23:59:59.999Z"));
      expect(before.filter((entry) => entry.sourceObjectId === document.id)).toEqual([]);

      await prisma.document.update({ where: { id: document.id }, data: { archived: true } });
      const after = await getCalendarItems(d("2099-01-01"), new Date("2099-04-30T23:59:59.999Z"));
      expect(after.filter((entry) => entry.sourceObjectId === document.id)).toEqual([]);
    });
  });

  describe("ownership", () => {
    it("can't renew someone else's document", async () => {
      const stranger = "recurring-document-stranger";
      await prisma.user.deleteMany({ where: { id: stranger } });
      await prisma.user.create({ data: { id: stranger, firstName: "Some", lastName: "One", email: "recurring-document-stranger@example.test" } });
      try {
        await prisma.object.create({ data: { id: "stranger-doc-object", type: "DOCUMENT", userId: stranger, name: "Their rego" } });
        await prisma.document.create({ data: { id: "stranger-doc", objectId: "stranger-doc-object", userId: stranger, name: "Their rego", type: "Vehicle", status: "Active", owner: "Some One", expiryDate: d("2099-01-31"), recurrence: "YEARLY", recurrenceAnchorDay: 31 } });

        await expect(renewDocumentAction("stranger-doc", "2099-01-31")).resolves.toEqual({ error: "This document no longer exists." });
        await expect(prisma.document.findUniqueOrThrow({ where: { id: "stranger-doc" } })).resolves.toMatchObject({ expiryDate: d("2099-01-31") });
      } finally {
        await prisma.user.deleteMany({ where: { id: stranger } });
      }
    });
  });
});
