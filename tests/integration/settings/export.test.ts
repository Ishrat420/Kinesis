import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  requireRecentVerificationResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireKinesisUser: mocks.requireKinesisUser,
  requireRecentVerificationResponse: mocks.requireRecentVerificationResponse,
}));

import { prisma } from "@/lib/data/prisma";
import { GET } from "@/app/api/settings/export/route";
import { seedEverything, tableCounts } from "./seed-everything";

/**
 * The export route names each table it reads, the same shape delete-all-data
 * names each table it deletes -- and drifted the same way, independently:
 * both were missing Template/TemplateField, and export was additionally
 * missing FieldLink, ActivityEvent and NotificationRead. This seeds one row
 * in every user-owned table (the same seed delete-all-data's own drift test
 * uses) and checks each table's data actually appears somewhere in the
 * exported JSON, so a table added later without a matching export field
 * fails here instead of quietly missing from every backup.
 */

const owner = "export-owner";

/** Every table name mapped to the export payload key(s) it should surface in. Multiple keys count if a table's rows can be nested under more than one. */
const EXPECTED_KEYS: Record<string, string[]> = {
  User: ["user"],
  UserSettings: ["settings"],
  Object: ["objects"],
  ObjectField: ["objectFields"],
  FieldLink: ["fieldLinks"],
  ObjectRelationship: ["objectRelationships"],
  Document: ["documents"],
  DocumentType: ["documentTypes"],
  Goal: ["goals"],
  Milestone: ["goals"],
  GoalMetricSnapshot: ["goals"],
  GoalUnit: ["goalUnits"],
  Person: ["people"],
  ConnectionPractice: ["people", "relationships"],
  RelationshipReflection: ["people", "relationships"],
  RelationshipImportantDate: ["people", "relationships"],
  Relationship: ["relationships"],
  RelationshipGoal: ["relationships"],
  FinanceItem: ["financeItems"],
  CustomModule: ["customModules"],
  CustomItem: ["customModules"],
  Template: ["templates"],
  TemplateField: ["templates"],
  Todo: ["todos"],
  AttentionDismissal: ["attentionDismissals"],
  ActivityEvent: ["activityEvents"],
  NotificationRead: ["notificationReads"],
  SecurityEvent: ["securityEvents"],
};

describe.sequential("the data export", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireRecentVerificationResponse.mockResolvedValue(true);
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Export", lastName: "Owner", email: "export-owner@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("surfaces every user-owned table somewhere in the payload, so the proof is not vacuous", async () => {
    await seedEverything(owner, "e");
    const counts = await tableCounts();
    const seeded = Object.entries(counts).filter(([, count]) => count > 0).map(([table]) => table);
    // If this fails, seed-everything.ts (shared with delete-all-data) is
    // missing a table -- fix the seed, not this list.
    expect(seeded.sort()).toEqual(Object.keys(EXPECTED_KEYS).sort());

    const response = await GET();
    const body = await response.json();

    for (const table of seeded) {
      const keys = EXPECTED_KEYS[table];
      const present = keys.some((key) => Array.isArray(body[key]) ? body[key].length > 0 : Boolean(body[key]?.length));
      expect(present, `expected ${table}'s row to surface under one of ${keys.join(", ")}`).toBe(true);
    }
  });

  it("scopes the export to the requesting owner only", async () => {
    const other = "export-other-owner";
    await prisma.user.deleteMany({ where: { id: other } });
    await prisma.user.create({ data: { id: other, firstName: "Other", lastName: "Owner", email: "export-other@example.test" } });
    await seedEverything(owner, "e");
    await seedEverything(other, "o");

    const response = await GET();
    const body = await response.json();

    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].name).toBe("Doc");
    await prisma.user.deleteMany({ where: { id: other } });
  });
});
