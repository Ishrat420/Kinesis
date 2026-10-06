// KD-052 Phase 4 manual QA fixture.
//
// Creates one anchor Document, Kinesis-Linked to nine target objects, each
// pre-loaded with an ObjectEvent that exercises one corner of the Surface
// Score rule matrix (lib/data/surface-score.ts + classifyEventSignificance
// in lib/data/object-events.ts) -- so the Kinesis Link peek's actual
// behaviour can be checked by hand against a written expectation instead of
// re-derived from memory every time. See tests/manual/kd052-surface-score-walkthrough.md
// for what to look for on each object.
//
// Idempotent: every row this script creates lives under the "kd052qa-" id
// prefix, and a re-run deletes that whole set (via cascading Object deletes)
// before recreating it -- safe to run repeatedly against the same database
// as the rule matrix, or the fixture itself, changes.
//
// No tsx/ts-node in this repo's devDependencies (see scripts/deploy-database.mjs,
// scripts/reset-test-database.mjs for the same constraint), so this is plain
// ESM importing @prisma/client directly rather than the app's lib/data/prisma.ts
// singleton -- consistent with both of those scripts.
//
// Usage:
//   node scripts/seed-kd052-qa-data.mjs                seed (uses DATABASE_URL)
//   node scripts/seed-kd052-qa-data.mjs --clean         remove the fixture, don't recreate
//   node scripts/seed-kd052-qa-data.mjs --user a@b.com  pick a user by email
//                                                        (Kinesis is single-tenant --
//                                                        ADR-014 -- so this is only
//                                                        needed if more than one
//                                                        User row somehow exists)
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TAG = "kd052qa";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

const args = process.argv.slice(2);
const cleanOnly = args.includes("--clean");
const userFlagIndex = args.indexOf("--user");
const userEmail = userFlagIndex !== -1 ? args[userFlagIndex + 1] : null;

async function resolveUser() {
  if (userEmail) {
    const user = await prisma.user.findFirst({ where: { email: userEmail } });
    if (!user) throw new Error(`No user found with email "${userEmail}".`);
    return user;
  }
  const users = await prisma.user.findMany({ take: 2 });
  if (users.length === 0) throw new Error("No User row exists yet -- sign in through the app once first.");
  if (users.length > 1) throw new Error(`Found more than one account (a deployment can host several, ADR-014). Pass --user <email> to pick one.`);
  return users[0];
}

/** Object.deleteMany cascades to every typed table, ObjectEvent, and ObjectRelationship (KD-048's schema), so deleting the Object rows alone clears the whole fixture. */
async function clean(userId) {
  const { count } = await prisma.object.deleteMany({ where: { userId, id: { startsWith: `${TAG}-` } } });
  console.log(`Removed ${count} previously seeded object(s).`);
}

async function main() {
  const user = await resolveUser();
  console.log(`Seeding into account: ${user.email} (${user.id})`);
  await clean(user.id);
  if (cleanOnly) {
    console.log("Clean-only run -- nothing recreated.");
    return;
  }

  const id = (suffix) => `${TAG}-${suffix}`;

  // ---- Anchor: every scenario object is Kinesis-Linked from here ----
  const anchorId = id("anchor");
  await prisma.object.create({ data: { id: anchorId, type: "DOCUMENT", name: "KD-052 QA Anchor", userId: user.id } });
  await prisma.document.create({
    data: { id: anchorId, objectId: anchorId, userId: user.id, name: "KD-052 QA Anchor", type: "QA Fixture", status: "Active", owner: user.firstName },
  });

  const financeItem = async (suffix, name, amount) => {
    const objectId = id(suffix);
    await prisma.object.create({ data: { id: objectId, type: "FINANCE_ITEM", name, userId: user.id } });
    await prisma.financeItem.create({ data: { id: objectId, objectId, userId: user.id, kind: "asset", name, amount } });
    return objectId;
  };
  const todo = async (suffix, name) => {
    const objectId = id(suffix);
    await prisma.object.create({ data: { id: objectId, type: "TODO", name, userId: user.id } });
    await prisma.todo.create({ data: { id: objectId, objectId, userId: user.id, name } });
    return objectId;
  };
  const goal = async (suffix, name) => {
    const objectId = id(suffix);
    await prisma.object.create({ data: { id: objectId, type: "GOAL", name, userId: user.id } });
    await prisma.goal.create({ data: { id: objectId, objectId, userId: user.id, name } });
    return objectId;
  };
  const document = async (suffix, name) => {
    const objectId = id(suffix);
    await prisma.object.create({ data: { id: objectId, type: "DOCUMENT", name, userId: user.id } });
    await prisma.document.create({ data: { id: objectId, objectId, userId: user.id, name, type: "QA Fixture", status: "Active", owner: user.firstName } });
    return objectId;
  };

  const link = async (targetObjectId, type, customLabel = null) => {
    await prisma.objectRelationship.create({
      data: {
        id: randomUUID(), userId: user.id, type, customLabel,
        sourceObjectId: anchorId, targetObjectId,
        pairKey: `${anchorId}:${targetObjectId}`,
      },
    });
  };

  const event = (objectId, fields) =>
    prisma.objectEvent.create({ data: { id: randomUUID(), userId: user.id, objectId, source: "USER", occurredAt: new Date(), ...fields } });

  // ---- T1: HIGH + fresh + relevant -- clearly surfaces ----
  // 70 (HIGH: amount >=2%) + 30 (freshness, 5d) + 20 (DEPENDS_ON) + 15 (magnitude, 40%) = 135
  const t1 = await financeItem("t1", "QA1 High Fresh Relevant", 1400);
  await link(t1, "DEPENDS_ON");
  await event(t1, { eventType: "FIELD_CHANGED", fieldKey: "amount", fieldLabel: "Amount", oldValue: "1000", newValue: "1400", occurredAt: daysAgo(5) });

  // ---- T2: LOW-only event -- gated before scoring, never surfaces ----
  const t2 = await todo("t2", "QA2 Low Only");
  await link(t2, "SUPPORTS");
  await event(t2, { eventType: "FIELD_CHANGED", fieldKey: "notes", fieldLabel: "Notes", oldValue: "old note", newValue: "new note", occurredAt: daysAgo(1) });

  // ---- T3: HIGH event, but >90 days old -- excluded by the eligibility window ----
  const t3 = await financeItem("t3", "QA3 High But Stale", 1000);
  await link(t3, "BLOCKS");
  await event(t3, { eventType: "FIELD_CHANGED", fieldKey: "amount", fieldLabel: "Amount", oldValue: "500", newValue: "1000", occurredAt: daysAgo(100) });

  // ---- T4: borderline, exactly at the score=50 threshold -- surfaces ----
  // 40 (NORMAL: unrecognized fieldKey default) + 0 (freshness, 45d) + 10 (SUPPORTS) = 50
  const t4 = await goal("t4", "QA4 Borderline Threshold");
  await link(t4, "SUPPORTS");
  await event(t4, { eventType: "FIELD_CHANGED", fieldKey: "qa-custom-field", fieldLabel: "Custom note", oldValue: "10", newValue: "14", occurredAt: daysAgo(45) });

  // ---- T5: IGNORE tier -- never in the peek, never in this object's own History either ----
  const t5 = await document("t5", "QA5 Ignore Tier");
  await link(t5, "RELATES_TO");
  await event(t5, { eventType: "FIELD_CHANGED", fieldKey: "issueDate", fieldLabel: "Issue date", oldValue: "2026-01-01", newValue: "2026-02-01", occurredAt: daysAgo(2) });

  // ---- T6: milestone completed -- big-diff peek, green "up" arrow ----
  // 70 (HIGH) + 30 (freshness, 3d) + 20 (DEPENDS_ON) = 120
  const t6 = await goal("t6", "QA6 Milestone Completed");
  await link(t6, "DEPENDS_ON");
  await prisma.milestone.createMany({
    data: [
      { id: id("t6-m1"), goalId: t6, name: "First", completed: true, completedAt: daysAgo(20), position: 0 },
      { id: id("t6-m2"), goalId: t6, name: "Second", completed: true, completedAt: daysAgo(3), position: 1 },
      { id: id("t6-m3"), goalId: t6, name: "Third", completed: false, position: 2 },
    ],
  });
  await event(t6, { eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: "Second", newValue: "2/3", occurredAt: daysAgo(3) });

  // ---- T7: milestone reopened -- big-diff peek, amber "down" arrow ----
  // 70 (HIGH) + 30 (freshness, 6d) + 10 (ALONGSIDE) = 110
  const t7 = await goal("t7", "QA7 Milestone Reopened");
  await link(t7, "ALONGSIDE");
  await prisma.milestone.createMany({
    data: [
      { id: id("t7-m1"), goalId: t7, name: "First", completed: true, completedAt: daysAgo(30), position: 0 },
      { id: id("t7-m2"), goalId: t7, name: "Second", completed: false, position: 1 },
      { id: id("t7-m3"), goalId: t7, name: "Third", completed: false, position: 2 },
    ],
  });
  await event(t7, { eventType: "GOAL_MILESTONE_REOPENED", fieldLabel: "Second", newValue: "1/3", occurredAt: daysAgo(6) });

  // ---- T8a/T8b: same NORMAL/aged event, relevance alone decides eligibility ----
  // 40 (NORMAL) + 0 (freshness, 45d) + relevance: BLOCKS(+20)=60 surfaces, CUSTOM(+0)=40 doesn't
  const t8a = await todo("t8a", "QA8a Relevance Wins");
  await link(t8a, "BLOCKS");
  await event(t8a, { eventType: "FIELD_CHANGED", fieldKey: "qa-custom-field", fieldLabel: "Custom note", oldValue: "10", newValue: "14", occurredAt: daysAgo(45) });

  const t8b = await todo("t8b", "QA8b Relevance Loses");
  await link(t8b, "CUSTOM", "Ad-hoc link");
  await event(t8b, { eventType: "FIELD_CHANGED", fieldKey: "qa-custom-field", fieldLabel: "Custom note", oldValue: "10", newValue: "14", occurredAt: daysAgo(45) });

  console.log(`\nDone. Open the anchor document to see every scenario's Kinesis Link card:\n  /documents/${anchorId}\n`);
  console.log("See tests/manual/kd052-surface-score-walkthrough.md for what each card (QA1-QA8b) should show.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
