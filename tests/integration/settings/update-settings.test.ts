import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { prisma } from "@/lib/data/prisma";
import { updateSettingsAction } from "@/app/(app)/settings/actions";

/**
 * updateSettingsAction had no integration coverage -- format/regional
 * preferences read on nearly every page (currency, locale, time zone,
 * reminder lead days) were only ever validated in isolation, never proven to
 * actually upsert the real UserSettings row, reject an unsupported region,
 * or bound each reminder lead-days field the way the form promises.
 */

const owner = "update-settings-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

const validFields: Record<string, string> = {
  locale: "en-AU",
  currency: "AUD",
  timeZone: "Australia/Sydney",
  milestoneReminderLeadDays: "7",
  relationshipReminderLeadDays: "3",
  customItemReminderLeadDays: "5",
  todoReminderLeadDays: "1",
};

const form = (overrides: Record<string, string> = {}, extra: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...validFields, ...overrides })) data.set(key, value);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
};

describe.sequential("updateSettingsAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Settings", lastName: "Owner", email: "update-settings@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("creates a UserSettings row on first save, with checkboxes read from 'on'", async () => {
    const result = await updateSettingsAction({}, form({}, { notificationsEnabled: "on" }));
    expect(result).toEqual({ message: "Settings saved." });

    const saved = await prisma.userSettings.findUniqueOrThrow({ where: { userId: owner } });
    expect(saved).toMatchObject({
      locale: "en-AU", currency: "AUD", timeZone: "Australia/Sydney",
      milestoneReminderLeadDays: 7, relationshipReminderLeadDays: 3, customItemReminderLeadDays: 5, todoReminderLeadDays: 1,
      notificationsEnabled: true, remindersEnabled: false,
    });
  });

  it("updates the existing row on a second save rather than duplicating it", async () => {
    await updateSettingsAction({}, form());
    await updateSettingsAction({}, form({ currency: "USD", locale: "en-US" }));

    const rows = await prisma.userSettings.findMany({ where: { userId: owner } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ currency: "USD", locale: "en-US" });
  });

  it("rejects an unsupported locale, currency, and time zone", async () => {
    await expect(updateSettingsAction({}, form({ locale: "xx-XX" }))).resolves.toEqual({ error: "Choose a valid region." });
    await expect(updateSettingsAction({}, form({ currency: "ZZZ" }))).resolves.toEqual({ error: "Choose a valid currency." });
    await expect(updateSettingsAction({}, form({ timeZone: "Not/AZone" }))).resolves.toEqual({ error: "Choose a valid time zone." });
    await expect(prisma.userSettings.findUnique({ where: { userId: owner } })).resolves.toBeNull();
  });

  it.each([
    ["milestoneReminderLeadDays", "Enter a number of days between 0 and 365 for milestones."],
    ["relationshipReminderLeadDays", "Enter a number of days between 0 and 365 for important dates."],
    ["customItemReminderLeadDays", "Enter a number of days between 0 and 365 for custom item due dates."],
    ["todoReminderLeadDays", "Enter a number of days between 0 and 365 for to-dos."],
  ])("bounds %s to 0-365, whole numbers only", async (field, message) => {
    await expect(updateSettingsAction({}, form({ [field]: "-1" }))).resolves.toEqual({ error: message });
    await expect(updateSettingsAction({}, form({ [field]: "366" }))).resolves.toEqual({ error: message });
    await expect(updateSettingsAction({}, form({ [field]: "3.5" }))).resolves.toEqual({ error: message });
    await expect(updateSettingsAction({}, form({ [field]: "not a number" }))).resolves.toEqual({ error: message });
  });

  it("saves each owner's settings independently", async () => {
    const other = "update-settings-other-owner";
    await prisma.user.deleteMany({ where: { id: other } });
    await prisma.user.create({ data: { id: other, firstName: "Other", lastName: "Owner", email: "update-settings-other@example.test" } });

    await updateSettingsAction({}, form());
    mocks.requireKinesisUser.mockResolvedValue({ id: other });
    await updateSettingsAction({}, form({ currency: "GBP", locale: "en-GB" }));

    await expect(prisma.userSettings.findUniqueOrThrow({ where: { userId: owner } })).resolves.toMatchObject({ currency: "AUD" });
    await expect(prisma.userSettings.findUniqueOrThrow({ where: { userId: other } })).resolves.toMatchObject({ currency: "GBP" });
    await prisma.user.deleteMany({ where: { id: other } });
  });
});
