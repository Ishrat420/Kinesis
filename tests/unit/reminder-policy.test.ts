import { describe, expect, it } from "vitest";
import { getReminderLeadDays, getReminderWindowEnd, getReminderWindowStart, REMINDER_LEAD_DEFAULTS } from "@/lib/reminders/policy";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("getReminderLeadDays: resolving a per-object-type lead time", () => {
  it("falls back to the default when settings are missing entirely", () => {
    expect(getReminderLeadDays(undefined, "milestone")).toBe(REMINDER_LEAD_DEFAULTS.milestone);
    expect(getReminderLeadDays(null, "milestone")).toBe(REMINDER_LEAD_DEFAULTS.milestone);
  });

  it("falls back to the default when the field is missing or null", () => {
    expect(getReminderLeadDays({}, "milestone")).toBe(REMINDER_LEAD_DEFAULTS.milestone);
    expect(getReminderLeadDays({ milestoneReminderLeadDays: null }, "milestone")).toBe(REMINDER_LEAD_DEFAULTS.milestone);
  });

  it("uses the configured value when present", () => {
    expect(getReminderLeadDays({ milestoneReminderLeadDays: 7 }, "milestone")).toBe(7);
  });

  it("allows zero, since that is a valid choice (no lead time at all)", () => {
    expect(getReminderLeadDays({ milestoneReminderLeadDays: 0 }, "milestone")).toBe(0);
  });

  it("falls back to the default for a negative or non-integer value rather than trusting bad data", () => {
    expect(getReminderLeadDays({ milestoneReminderLeadDays: -5 }, "milestone")).toBe(REMINDER_LEAD_DEFAULTS.milestone);
    expect(getReminderLeadDays({ milestoneReminderLeadDays: 2.5 }, "milestone")).toBe(REMINDER_LEAD_DEFAULTS.milestone);
  });
});

describe("getReminderLeadDays: milestone and relationship are independent settings", () => {
  it("resolves the relationship default the same way as milestone's, from its own field", () => {
    expect(getReminderLeadDays(undefined, "relationship")).toBe(REMINDER_LEAD_DEFAULTS.relationship);
    expect(getReminderLeadDays({ relationshipReminderLeadDays: 14 }, "relationship")).toBe(14);
  });

  it("a value configured for one object type does not leak into the other", () => {
    const settings = { milestoneReminderLeadDays: 7, relationshipReminderLeadDays: 60 };
    expect(getReminderLeadDays(settings, "milestone")).toBe(7);
    expect(getReminderLeadDays(settings, "relationship")).toBe(60);
  });

  it("an unset relationship field falls back to its own default even when milestone is configured", () => {
    expect(getReminderLeadDays({ milestoneReminderLeadDays: 7 }, "relationship")).toBe(REMINDER_LEAD_DEFAULTS.relationship);
  });

  it("resolves the custom item default the same way, from its own field, independent of the other two", () => {
    expect(getReminderLeadDays(undefined, "customItem")).toBe(REMINDER_LEAD_DEFAULTS.customItem);
    const settings = { milestoneReminderLeadDays: 7, relationshipReminderLeadDays: 60, customItemReminderLeadDays: 14 };
    expect(getReminderLeadDays(settings, "customItem")).toBe(14);
    expect(getReminderLeadDays(settings, "milestone")).toBe(7);
    expect(getReminderLeadDays(settings, "relationship")).toBe(60);
  });
});

describe("getReminderWindowStart / getReminderWindowEnd: the shared window math", () => {
  it("opens the window that many calendar days before the due date", () => {
    expect(getReminderWindowStart(at("2026-07-01"), 30).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("closes the window that many calendar days after today", () => {
    expect(getReminderWindowEnd(at("2026-06-01"), 30).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("collapses to the due date itself, or to today, when the lead time is zero", () => {
    expect(getReminderWindowStart(at("2026-07-01"), 0).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(getReminderWindowEnd(at("2026-06-01"), 0).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});
