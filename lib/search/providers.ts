import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";
import type { SearchProvider } from "./types";
import { requireKinesisUser } from "@/lib/auth";
import { getFormatPreferences } from "@/lib/format/server";
import { formatMoney } from "@/lib/format/numbers";
import { todoStatusLabel } from "@/lib/todos/status";
import { getUserDisplayName } from "@/lib/data/user";
import { normalize, searchTerms } from "./rank";
import { candidateWhere, matchesTerm, textColumn } from "./sql-match";

const text = (...values: unknown[]) => values.flat(Infinity).filter((value) => value !== null && value !== undefined && value !== "").map(String);

/**
 * How many rows a provider's SQL narrowing hands to `rankSearchEntries` per
 * table. Generous on purpose -- this only has to comfortably exceed the
 * final ten-result limit, not be tight -- since a candidate the ranker
 * doesn't like is simply dropped there.
 */
const CANDIDATE_LIMIT = 50;

const documents: SearchProvider = {
  id: "documents",
  async getEntries(query) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const user = await requireKinesisUser();

    const where = candidateWhere(terms, [
      textColumn('"Document"."name"'),
      textColumn('"Document"."type"'),
      textColumn('"Document"."status"'),
      textColumn('"Document"."owner"'),
      textColumn('"Document"."documentNumber"'),
      textColumn('"Document"."country"'),
      textColumn('"Document"."notes"'),
      textColumn('"Document"."link"'),
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "ObjectField" f WHERE f."objectId" = "Document"."objectId" AND (${matchesTerm('f."label"', term)} OR ${matchesTerm('f."value"', term)}))`,
    ]);
    const candidates = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Document" WHERE "userId" = ${user.id} AND (${where}) LIMIT ${CANDIDATE_LIMIT}`;
    if (!candidates.length) return [];

    const rows = await prisma.document.findMany({ where: { id: { in: candidates.map((row) => row.id) } }, include: { object: { select: { fields: true } } } });
    return rows.map((document) => ({
      id: `document:${document.id}`, title: document.name, subtitle: document.type,
      href: `/documents/${document.id}`, kind: "Document" as const,
      keywords: text(document.name, document.type, document.status, document.owner, document.documentNumber, document.country, document.notes, document.link, document.object.fields.flatMap((field) => [field.label, field.value])),
    }));
  },
};

const goals: SearchProvider = {
  id: "goals",
  async getEntries(query) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const user = await requireKinesisUser();

    const where = candidateWhere(terms, [
      textColumn('"Goal"."name"'),
      textColumn('"Goal"."status"'),
      textColumn('"Goal"."note"'),
      textColumn('"Goal"."unit"'),
      textColumn('"Goal"."targetValue"::text'),
      textColumn('"Goal"."currentValue"::text'),
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "Milestone" m WHERE m."goalId" = "Goal"."id" AND ${matchesTerm('m."name"', term)})`,
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "ObjectField" f WHERE f."objectId" = "Goal"."objectId" AND (${matchesTerm('f."label"', term)} OR ${matchesTerm('f."value"', term)}))`,
    ]);
    const candidates = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Goal" WHERE "userId" = ${user.id} AND (${where}) LIMIT ${CANDIDATE_LIMIT}`;
    if (!candidates.length) return [];

    const rows = await prisma.goal.findMany({ where: { id: { in: candidates.map((row) => row.id) } }, include: { milestones: true, object: { select: { fields: true } } } });
    return rows.map((goal) => ({
      id: `goal:${goal.id}`, title: goal.name, subtitle: `${goal.status} goal`,
      href: `/goals/${goal.id}`, kind: "Goal" as const,
      keywords: text(goal.name, goal.status, goal.note, goal.unit, goal.targetValue, goal.currentValue, goal.milestones.map((milestone) => milestone.name), goal.object.fields.flatMap((field) => [field.label, field.value])),
    }));
  },
};

const finance: SearchProvider = {
  id: "finance",
  async getEntries(query) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const user = await requireKinesisUser();

    const where = candidateWhere(terms, [
      textColumn('"FinanceItem"."name"'),
      textColumn('"FinanceItem"."kind"'),
      textColumn('"FinanceItem"."category"'),
      textColumn('"FinanceItem"."notes"'),
      textColumn('"FinanceItem"."amount"::text'),
      textColumn('"FinanceItem"."rate"::text'),
      textColumn('"FinanceItem"."frequency"'),
    ]);
    const candidates = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FinanceItem" WHERE "userId" = ${user.id} AND (${where}) LIMIT ${CANDIDATE_LIMIT}`;
    if (!candidates.length) return [];

    const [rows, { locale, currency }] = await Promise.all([
      prisma.financeItem.findMany({ where: { id: { in: candidates.map((row) => row.id) } } }),
      getFormatPreferences(),
    ]);
    return rows.map((item) => ({
      id: `finance:${item.id}`, title: item.name,
      subtitle: `${item.category || item.kind} · ${formatMoney(item.amount, locale, currency)}`,
      href: "/finance", kind: "Finance" as const,
      keywords: text(item.name, item.kind, item.category, item.notes, item.amount, item.rate, item.frequency),
    }));
  },
};

/** Normalised once: constant keywords never depend on row data, so their match is decided before any query runs. */
const PERSON_KEYWORD_CONSTANTS = ["person", "relationship"].map(normalize);

const relationships: SearchProvider = {
  id: "relationships",
  async getEntries(query) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const user = await requireKinesisUser();

    const peopleWhere = candidateWhere(terms, [textColumn('"Person"."name"'), textColumn('"Person"."category"')], PERSON_KEYWORD_CONSTANTS);
    const connectionsWhere = candidateWhere(terms, [
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "Person" p WHERE p."id" = "Relationship"."firstPersonId" AND ${matchesTerm('p."name"', term)})`,
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "Person" p WHERE p."id" = "Relationship"."secondPersonId" AND ${matchesTerm('p."name"', term)})`,
      textColumn('"Relationship"."type"'),
      textColumn('"Relationship"."notes"'),
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "ConnectionPractice" c WHERE c."relationshipId" = "Relationship"."id" AND (${matchesTerm('c."title"', term)} OR ${matchesTerm('c."cadence"', term)}))`,
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "RelationshipReflection" r WHERE r."relationshipId" = "Relationship"."id" AND ${matchesTerm('r."text"', term)})`,
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "RelationshipImportantDate" d WHERE d."relationshipId" = "Relationship"."id" AND ${matchesTerm('d."label"', term)})`,
    ]);

    const [peopleCandidates, connectionCandidates] = await Promise.all([
      prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Person" WHERE "userId" = ${user.id} AND (${peopleWhere}) LIMIT ${CANDIDATE_LIMIT}`,
      prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Relationship" WHERE "userId" = ${user.id} AND (${connectionsWhere}) LIMIT ${CANDIDATE_LIMIT}`,
    ]);

    const [people, connections] = await Promise.all([
      peopleCandidates.length ? prisma.person.findMany({ where: { id: { in: peopleCandidates.map((row) => row.id) } } }) : Promise.resolve([]),
      connectionCandidates.length ? prisma.relationship.findMany({ where: { id: { in: connectionCandidates.map((row) => row.id) } }, include: { firstPerson: true, secondPerson: true, practices: true, reflections: true, importantDates: true } }) : Promise.resolve([]),
    ]);

    return [
      ...people.map((person) => ({
        // A self person's display name follows the same preferred-name
        // override every other surface honours, rather than the raw stored
        // name (previously applied by Topbar, after the whole index had
        // already been fetched -- now the provider's own job).
        id: `person:${person.id}`, title: person.isSelf ? getUserDisplayName(user) : person.name, subtitle: person.isSelf ? "You" : person.category || "Relationship",
        href: "/relationships", kind: "Relationship" as const,
        keywords: text(person.name, person.category, "person", "relationship"),
      })),
      ...connections.map((relationship) => ({
        id: `relationship:${relationship.id}`, title: `${relationship.firstPerson.name} & ${relationship.secondPerson.name}`,
        subtitle: relationship.type || "Relationship", href: "/relationships", kind: "Relationship" as const,
        keywords: text(relationship.firstPerson.name, relationship.secondPerson.name, relationship.type, relationship.notes, relationship.practices.flatMap((item) => [item.title, item.cadence]), relationship.reflections.map((item) => item.text), relationship.importantDates.map((item) => item.label)),
      })),
    ];
  },
};

const CUSTOM_MODULE_KEYWORD_CONSTANTS = ["custom module"].map(normalize);

/** One provider covers every user-created module, including modules created later. */
const customModules: SearchProvider = {
  id: "custom-modules",
  async getEntries(query) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const user = await requireKinesisUser();

    const moduleWhere = candidateWhere(terms, [textColumn('"CustomModule"."name"'), textColumn('"CustomModule"."description"')], CUSTOM_MODULE_KEYWORD_CONSTANTS);
    const itemWhere = candidateWhere(terms, [
      textColumn('"CustomItem"."name"'),
      textColumn('"CustomModule"."name"'),
      (term) => Prisma.sql`EXISTS (SELECT 1 FROM "ObjectField" f WHERE f."objectId" = "CustomItem"."objectId" AND (${matchesTerm('f."label"', term)} OR ${matchesTerm('f."value"', term)}))`,
    ]);

    const [moduleCandidates, itemCandidates] = await Promise.all([
      prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CustomModule" WHERE "userId" = ${user.id} AND (${moduleWhere}) LIMIT ${CANDIDATE_LIMIT}`,
      prisma.$queryRaw<{ id: string }[]>`
        SELECT "CustomItem"."id" FROM "CustomItem"
        JOIN "CustomModule" ON "CustomModule"."id" = "CustomItem"."moduleId"
        WHERE "CustomModule"."userId" = ${user.id} AND "CustomItem"."archived" = false AND (${itemWhere})
        LIMIT ${CANDIDATE_LIMIT}
      `,
    ]);

    const [modules, items] = await Promise.all([
      moduleCandidates.length ? prisma.customModule.findMany({ where: { id: { in: moduleCandidates.map((row) => row.id) } } }) : Promise.resolve([]),
      itemCandidates.length
        ? prisma.customItem.findMany({ where: { id: { in: itemCandidates.map((row) => row.id) } }, include: { object: { select: { fields: true } }, module: { select: { id: true, name: true, icon: true, color: true } } } })
        : Promise.resolve([]),
    ]);

    return [
      ...modules.map((module) => ({
        id: `custom-module:${module.id}`, title: module.name, subtitle: "Custom module",
        href: `/custom-modules/${module.id}`, kind: "Custom" as const, icon: module.icon, color: module.color,
        keywords: text(module.name, module.description, "custom module"),
      })),
      ...items.map((item) => ({
        id: `custom-item:${item.id}`, title: item.name, subtitle: item.module.name,
        href: `/custom-modules/${item.module.id}/items/${item.id}`, kind: "Custom" as const, icon: item.module.icon, color: item.module.color,
        keywords: text(item.name, item.module.name, item.object.fields.flatMap((field) => [field.label, field.value])),
      })),
    ];
  },
};

const TODO_KEYWORD_CONSTANTS = ["to-do", "todo", "task", todoStatusLabel("TODO"), todoStatusLabel("WAITING"), todoStatusLabel("DONE")].map(normalize);

/** Captured To-Dos are searchable from the moment they exist, title only. */
const todos: SearchProvider = {
  id: "todos",
  async getEntries(query) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const user = await requireKinesisUser();

    const where = candidateWhere(terms, [textColumn('"Todo"."name"')], TODO_KEYWORD_CONSTANTS);
    const candidates = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Todo" WHERE "userId" = ${user.id} AND (${where}) LIMIT ${CANDIDATE_LIMIT}`;
    if (!candidates.length) return [];

    const rows = await prisma.todo.findMany({ where: { id: { in: candidates.map((row) => row.id) } } });
    return rows.map((todo) => ({
      id: `todo:${todo.id}`, title: todo.name, subtitle: `${todoStatusLabel(todo.status)} · To-Do`,
      href: `/todos#todo-${todo.id}`, kind: "Todo" as const,
      keywords: text(todo.name, todoStatusLabel(todo.status), "to-do", "todo", "task"),
    }));
  },
};

/** Add a provider here when introducing a new first-party module. */
export const searchProviders: readonly SearchProvider[] = [documents, goals, finance, relationships, customModules, todos];
