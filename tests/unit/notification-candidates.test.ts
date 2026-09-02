import { describe, expect, it, vi } from "vitest";

// The engine's reconcilers reach Prisma, but the two candidate builders under
// test are pure; the client is stubbed so they run without a database.
vi.mock("@/lib/data/prisma", () => ({ prisma: {} }));

const { getDocumentNotificationCandidate, getMilestoneNotificationCandidate } =
  await import("@/lib/notifications/engine");

const document = (expiryDate: string | null, prompt = 30) => ({
  id: "document-1",
  name: "Passport",
  type: "Identity",
  expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`) : null,
  prompt,
});

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

const milestone = (dueDate: string | null) => ({
  id: "milestone-1",
  name: "Submit application",
  dueDate: dueDate ? at(dueDate) : null,
  goal: { id: "goal-1", name: "Move house" },
});

describe("getDocumentNotificationCandidate: deciding whether an alert is due", () => {
  it("raises nothing for a document with no expiry date", () => {
    expect(getDocumentNotificationCandidate(document(null), at("2026-06-01"))).toBeNull();
  });

  it("raises nothing while the expiry date is still outside the reminder window", () => {
    // 30-day prompt on a 1 August expiry starts reminding on 2 July.
    expect(getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-01"))).toBeNull();
  });

  it("raises a reminder on the first day of the reminder window", () => {
    expect(getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-02"))?.type)
      .toBe("REMINDER_DUE");
  });

  it("keeps reminding every day between the window opening and the expiry date", () => {
    expect(getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-20"))?.type)
      .toBe("REMINDER_DUE");
  });

  it("still reminds rather than expiring on the expiry date itself, since the document is valid all day", () => {
    expect(getDocumentNotificationCandidate(document("2026-08-01"), at("2026-08-01"))?.type)
      .toBe("REMINDER_DUE");
  });

  it("switches to expired on the day after the expiry date", () => {
    expect(getDocumentNotificationCandidate(document("2026-08-01"), at("2026-08-02"))?.type)
      .toBe("EXPIRED");
  });

  it("ignores the time of day, comparing calendar days in UTC", () => {
    const lateInTheDay = new Date("2026-08-01T23:59:59.000Z");

    expect(getDocumentNotificationCandidate(document("2026-08-01"), lateInTheDay)?.type)
      .toBe("REMINDER_DUE");
  });
});

describe("getDocumentNotificationCandidate: respecting the user's reminder setting", () => {
  it("suppresses a pre-expiry reminder when reminders are switched off", () => {
    expect(getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-20"), false)).toBeNull();
  });

  it("still reports an expired document when reminders are switched off, since expiry is not a reminder", () => {
    expect(getDocumentNotificationCandidate(document("2026-08-01"), at("2026-08-02"), false)?.type)
      .toBe("EXPIRED");
  });
});

describe("getDocumentNotificationCandidate: the wording and payload of a reminder", () => {
  it("counts down in days inside the final two months", () => {
    const candidate = getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-20"));

    expect(candidate?.timeUntilExpiry).toBe("12 days");
    expect(candidate?.message).toBe("Passport expires in 12 days");
  });

  it("uses the singular day form on the eve of expiry", () => {
    const candidate = getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-31"));

    expect(candidate?.timeUntilExpiry).toBe("1 day");
    expect(candidate?.message).toBe("Passport expires in 1 day");
  });

  it("says the document expires today rather than in zero days", () => {
    const candidate = getDocumentNotificationCandidate(document("2026-08-01"), at("2026-08-01"));

    expect(candidate?.message).toBe("Passport expires today");
  });

  it("switches to a calendar duration once more than two months remain", () => {
    // A one-year prompt keeps the reminder open long before the day count is useful.
    const candidate = getDocumentNotificationCandidate(document("2027-08-01", 365), at("2026-08-15"));

    expect(candidate?.timeUntilExpiry).toBe("11 months, 17 days");
    expect(candidate?.message).toBe("Passport expires in 11 months, 17 days");
  });

  it("links the alert to the document it came from and carries its name and type", () => {
    const candidate = getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-20"));

    expect(candidate).toMatchObject({
      actionUrl: "/documents/document-1",
      documentName: "Passport",
      documentType: "Identity",
    });
  });

  it("reports the date the reminder window opened, which the reconciler dedupes on", () => {
    const candidate = getDocumentNotificationCandidate(document("2026-08-01"), at("2026-07-20"));

    expect(candidate?.reminderAt?.toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });
});

describe("getDocumentNotificationCandidate: the wording of an expiry", () => {
  it("names the date the document expired and carries no countdown", () => {
    const candidate = getDocumentNotificationCandidate(document("2026-08-01"), at("2026-09-10"));

    expect(candidate?.message).toBe("Passport expired on 1 Aug 2026");
    expect(candidate?.timeUntilExpiry).toBeNull();
  });

  it("writes that date in the locale it is given", () => {
    const candidate = getDocumentNotificationCandidate(document("2026-08-01"), at("2026-09-10"), true, "en-US");

    expect(candidate?.message).toBe("Passport expired on Aug 1, 2026");
  });
});

describe("getMilestoneNotificationCandidate: alerting on due and overdue milestones", () => {
  it("raises nothing for a milestone with no due date", () => {
    expect(getMilestoneNotificationCandidate(milestone(null), at("2026-06-01"))).toBeNull();
  });

  it("raises nothing before the due date when no lead time is given, however close it is", () => {
    expect(getMilestoneNotificationCandidate(milestone("2026-06-02"), at("2026-06-01"))).toBeNull();
  });

  it("raises an alert on the due date itself", () => {
    const candidate = getMilestoneNotificationCandidate(milestone("2026-06-01"), at("2026-06-01"));

    expect(candidate?.type).toBe("MILESTONE_DUE");
    expect(candidate?.message).toBe("Submit application is due today");
  });

  it("keeps the alert current while the milestone stays overdue, counting the days", () => {
    expect(getMilestoneNotificationCandidate(milestone("2026-06-01"), at("2026-06-02"))?.message)
      .toBe("Submit application is 1 day overdue");
    expect(getMilestoneNotificationCandidate(milestone("2026-06-01"), at("2026-06-08"))?.message)
      .toBe("Submit application is 7 days overdue");
  });

  it("compares calendar days, so a due date earlier the same day is not yet overdue", () => {
    const candidate = getMilestoneNotificationCandidate(milestone("2026-06-01"), new Date("2026-06-01T18:30:00.000Z"));

    expect(candidate?.message).toBe("Submit application is due today");
  });

  it("attributes the alert to its parent goal and links back to that goal", () => {
    const candidate = getMilestoneNotificationCandidate(milestone("2026-06-01"), at("2026-06-01"));

    expect(candidate).toMatchObject({
      documentName: "Submit application",
      documentType: "Milestone · Move house",
      actionUrl: "/goals/goal-1",
    });
  });

  it("dedupes on the due date and carries no expiry countdown", () => {
    const candidate = getMilestoneNotificationCandidate(milestone("2026-06-01"), at("2026-06-05"));

    expect(candidate?.reminderAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(candidate?.expiryDate.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(candidate?.timeUntilExpiry).toBeNull();
  });
});

describe("getMilestoneNotificationCandidate: the configurable lead time", () => {
  it("raises nothing while today is still outside the lead window", () => {
    // A 30-day lead on a 1 July due date opens on 1 June.
    expect(getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-05-31"), 30)).toBeNull();
  });

  it("raises a reminder on the first day of the lead window", () => {
    const candidate = getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-06-01"), 30);

    expect(candidate?.type).toBe("REMINDER_DUE");
    expect(candidate?.message).toBe("Submit application is 30 days left");
    expect(candidate?.reminderAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("keeps reminding every day between the window opening and the due date", () => {
    expect(getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-06-20"), 30)?.type)
      .toBe("REMINDER_DUE");
  });

  it("switches from REMINDER_DUE to MILESTONE_DUE on the due date itself", () => {
    const candidate = getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-07-01"), 30);

    expect(candidate?.type).toBe("MILESTONE_DUE");
    expect(candidate?.message).toBe("Submit application is due today");
  });

  it("stays MILESTONE_DUE, not REMINDER_DUE, once the milestone is overdue", () => {
    expect(getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-07-05"), 30)?.type)
      .toBe("MILESTONE_DUE");
  });

  it("treats a zero lead time exactly like the default: due date onward only", () => {
    expect(getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-06-30"), 0)).toBeNull();
    expect(getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-07-01"), 0)?.type)
      .toBe("MILESTONE_DUE");
  });

  it("dedupes a not-yet-due reminder on the due date, same as an overdue one", () => {
    const candidate = getMilestoneNotificationCandidate(milestone("2026-07-01"), at("2026-06-15"), 30);

    expect(candidate?.expiryDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
