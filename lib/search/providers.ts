import { prisma } from "@/lib/data/prisma";
import type { SearchProvider } from "./types";

const text = (...values: unknown[]) => values.flat(Infinity).filter((value) => value !== null && value !== undefined && value !== "").map(String);

const documents: SearchProvider = {
  id: "documents",
  async getEntries() {
    const rows = await prisma.document.findMany({ include: { customFields: true } });
    return rows.map((document) => ({
      id: `document:${document.id}`, title: document.name, subtitle: document.type,
      href: `/documents/${document.id}`, kind: "Document" as const,
      keywords: text(document.name, document.type, document.status, document.owner, document.documentNumber, document.country, document.notes, document.link, document.customFields.flatMap((field) => [field.label, field.value])),
    }));
  },
};

const goals: SearchProvider = {
  id: "goals",
  async getEntries() {
    const rows = await prisma.goal.findMany({ include: { milestones: true } });
    return rows.map((goal) => ({
      id: `goal:${goal.id}`, title: goal.name, subtitle: `${goal.status} goal`,
      href: `/goals/${goal.id}`, kind: "Goal" as const,
      keywords: text(goal.name, goal.status, goal.note, goal.unit, goal.targetValue, goal.currentValue, goal.milestones.map((milestone) => milestone.name)),
    }));
  },
};

const finance: SearchProvider = {
  id: "finance",
  async getEntries() {
    const rows = await prisma.financeItem.findMany();
    return rows.map((item) => ({
      id: `finance:${item.id}`, title: item.name,
      subtitle: `${item.category || item.kind} · $${item.amount.toLocaleString("en-AU")}`,
      href: "/finance", kind: "Finance" as const,
      keywords: text(item.name, item.kind, item.category, item.notes, item.amount, item.rate, item.frequency),
    }));
  },
};

const relationships: SearchProvider = {
  id: "relationships",
  async getEntries() {
    const [people, connections] = await Promise.all([
      prisma.person.findMany(),
      prisma.relationship.findMany({ include: { firstPerson: true, secondPerson: true, practices: true, reflections: true, importantDates: true } }),
    ]);
    return [
      ...people.map((person) => ({
        id: `person:${person.id}`, title: person.name, subtitle: person.isSelf ? "You" : person.category || "Relationship",
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

/** One provider covers every user-created module, including modules created later. */
const customModules: SearchProvider = {
  id: "custom-modules",
  async getEntries() {
    const modules = await prisma.customModule.findMany({ include: { items: { where: { archived: false }, include: { fields: true } } } });
    return modules.flatMap((module) => [
      {
        id: `custom-module:${module.id}`, title: module.name, subtitle: "Custom module",
        href: `/custom-modules/${module.id}`, kind: "Custom" as const, icon: module.icon, color: module.color,
        keywords: text(module.name, module.description, "custom module"),
      },
      ...module.items.map((item) => ({
        id: `custom-item:${item.id}`, title: item.name, subtitle: module.name,
        href: `/custom-modules/${module.id}/items/${item.id}`, kind: "Custom" as const, icon: module.icon, color: module.color,
        keywords: text(item.name, module.name, item.notes, item.link, item.fields.flatMap((field) => [field.label, field.value])),
      })),
    ]);
  },
};

/** Add a provider here when introducing a new first-party module. */
export const searchProviders: readonly SearchProvider[] = [documents, goals, finance, relationships, customModules];
