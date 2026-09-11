import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRecentVerification: vi.fn(),
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
  securityCreate: vi.fn(() => Promise.resolve({})),
  settingsUpsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireRecentVerification: mocks.requireRecentVerification, requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    notificationRead: { deleteMany: mocks.deleteMany }, object: { deleteMany: mocks.deleteMany }, attentionDismissal: { deleteMany: mocks.deleteMany },
    document: { deleteMany: mocks.deleteMany }, documentType: { deleteMany: mocks.deleteMany },
    relationshipGoal: { deleteMany: mocks.deleteMany }, relationship: { deleteMany: mocks.deleteMany },
    person: { deleteMany: mocks.deleteMany }, goal: { deleteMany: mocks.deleteMany },
    goalUnit: { deleteMany: mocks.deleteMany }, customModule: { deleteMany: mocks.deleteMany }, template: { deleteMany: mocks.deleteMany },
    financeItem: { deleteMany: mocks.deleteMany }, userSettings: { deleteMany: mocks.deleteMany, upsert: mocks.settingsUpsert },
    activityEvent: { deleteMany: mocks.deleteMany }, securityEvent: { create: mocks.securityCreate },
    $transaction: mocks.transaction,
  },
}));

import { deleteAllDataAction, updateSettingsAction } from "@/app/(app)/settings/actions";
import { DELETE_ALL_CONFIRMATION } from "@/app/(app)/settings/constants";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from "@/lib/format/preferences";

describe("delete all data security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRecentVerification.mockResolvedValue(true);
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.transaction.mockResolvedValue([]);
  });

  it("does not delete when recent verification is required", async () => {
    const challenge = { clerk_error: { reason: "reverification-error" } };
    mocks.requireRecentVerification.mockResolvedValue(challenge);

    await expect(deleteAllDataAction(DELETE_ALL_CONFIRMATION)).resolves.toBe(challenge);
    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("enforces the confirmation phrase on the server", async () => {
    await expect(deleteAllDataAction("yes")).resolves.toEqual({ error: "Enter the confirmation phrase exactly as shown." });
    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("records a content-free security event in the deletion transaction", async () => {
    await expect(deleteAllDataAction(DELETE_ALL_CONFIRMATION)).resolves.toEqual({ success: true });
    expect(mocks.securityCreate).toHaveBeenCalledWith({ data: { event: "ALL_DATA_DELETED", userId: "owner-id" } });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

/**
 * The least-covered save form in the app before this: five independent
 * validation branches (three checked against Intl/a supported-values list,
 * two 0-365 day-range checks) and nothing asserting any of them, or that a
 * valid submission actually reaches the database.
 */
describe("updateSettingsAction", () => {
  const validValues = () => ({
    locale: DEFAULT_LOCALE,
    currency: DEFAULT_CURRENCY,
    timeZone: DEFAULT_TIME_ZONE,
    milestoneReminderLeadDays: "30",
    relationshipReminderLeadDays: "14",
    customItemReminderLeadDays: "7",
  });
  const form = (overrides: Partial<Record<string, string>> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...validValues(), ...overrides })) data.set(key, value);
    return data;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
  });

  it("rejects an unsupported locale", async () => {
    await expect(updateSettingsAction({}, form({ locale: "xx-XX" }))).resolves.toEqual({ error: "Choose a valid region." });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects an unsupported currency", async () => {
    await expect(updateSettingsAction({}, form({ currency: "XXX" }))).resolves.toEqual({ error: "Choose a valid currency." });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects a time zone Intl cannot resolve", async () => {
    await expect(updateSettingsAction({}, form({ timeZone: "Not/AZone" }))).resolves.toEqual({ error: "Choose a valid time zone." });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["milestoneReminderLeadDays", "milestones"],
    ["relationshipReminderLeadDays", "important dates"],
    ["customItemReminderLeadDays", "custom item due dates"],
  ])("rejects a non-numeric %s", async (field, label) => {
    await expect(updateSettingsAction({}, form({ [field]: "soon" }))).resolves.toEqual({ error: `Enter a number of days between 0 and 365 for ${label}.` });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["milestoneReminderLeadDays", "milestones"],
    ["relationshipReminderLeadDays", "important dates"],
    ["customItemReminderLeadDays", "custom item due dates"],
  ])("rejects a negative %s", async (field, label) => {
    await expect(updateSettingsAction({}, form({ [field]: "-1" }))).resolves.toEqual({ error: `Enter a number of days between 0 and 365 for ${label}.` });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["milestoneReminderLeadDays", "milestones"],
    ["relationshipReminderLeadDays", "important dates"],
    ["customItemReminderLeadDays", "custom item due dates"],
  ])("rejects a %s over 365", async (field, label) => {
    await expect(updateSettingsAction({}, form({ [field]: "366" }))).resolves.toEqual({ error: `Enter a number of days between 0 and 365 for ${label}.` });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects a non-integer lead-day value", async () => {
    await expect(updateSettingsAction({}, form({ milestoneReminderLeadDays: "5.5" }))).resolves.toEqual({ error: "Enter a number of days between 0 and 365 for milestones." });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it.each([0, 365])("accepts a lead-day value at the %i boundary", async (days) => {
    await expect(updateSettingsAction({}, form({ milestoneReminderLeadDays: String(days) }))).resolves.toEqual({ message: "Settings saved." });
    expect(mocks.settingsUpsert).toHaveBeenCalledOnce();
  });

  it("saves valid settings and turns the checkbox fields on", async () => {
    await expect(updateSettingsAction({}, form({ notificationsEnabled: "on", remindersEnabled: "on" }))).resolves.toEqual({ message: "Settings saved." });
    const data = {
      locale: DEFAULT_LOCALE, currency: DEFAULT_CURRENCY, timeZone: DEFAULT_TIME_ZONE,
      notificationsEnabled: true, remindersEnabled: true,
      milestoneReminderLeadDays: 30, relationshipReminderLeadDays: 14, customItemReminderLeadDays: 7,
    };
    expect(mocks.settingsUpsert).toHaveBeenCalledWith({ where: { userId: "owner-id" }, create: { userId: "owner-id", ...data }, update: data });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("treats an absent checkbox field as turned off", async () => {
    await updateSettingsAction({}, form());
    expect(mocks.settingsUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ notificationsEnabled: false, remindersEnabled: false }),
    }));
  });
});
