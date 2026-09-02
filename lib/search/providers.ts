import { prisma } from "@/lib/data/prisma";
import type { SearchProvider } from "./types";
import { requireKinesisUser } from "@/lib/auth";
import { getFormatPreferences } from "@/lib/format/server";
import { formatMoney } from "@/lib/format/numbers";
import { todoStatusLabel } from "@/lib/todos/status";

const text = (...values: unknown[]) => values.flat(Infinity).filter((value) => value !== null && value !== undefined && value !== "").map(String);

const documents: SearchProvider = {
  id: "documents",
  async getEntries() {
    const user = await requireKinesisUser();
    const rows = await prisma.document.findMany({ where: { userId: user.id }, include: { customFields: true } });
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
    const user = await requireKinesisUser();
    const rows = await prisma.goal.findMany({ where: { userId: user.id }, include: { milestones: true } });
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
    const user = await requireKinesisUser();
    const [rows, { locale, currency }] = await Promise.all([
      prisma.financeItem.findMany({ where: { userId: user.id } }),
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

const relationships: SearchProvider = {
  id: "relationships",
  async getEntries() {
    const user = await requireKinesisUser();
    const [people, connections] = await Promise.all([
      prisma.person.findMany({ where: { userId: user.id } }),
      prisma.relationship.findMany({ where: { userId: user.id }, include: { firstPerson: true, secondPerson: true, practices: true, reflections: true, importantDates: true } }),
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
    const user = await requireKinesisUser();
    const modules = await prisma.customModule.findMany({ where: { userId: user.id }, include: { items: { where: { archived: false }, include: { fields: true } } } });
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

/** Captured To-Dos are searchable from the moment they exist, title only. */
const todos: SearchProvider = {
  id: "todos",
  async getEntries() {
    const user = await requireKinesisUser();
    const rows = await prisma.todo.findMany({ where: { userId: user.id } });
    return rows.map((todo) => ({
      id: `todo:${todo.id}`, title: todo.name, subtitle: `${todoStatusLabel(todo.status)} · To-Do`,
      href: `/todos#todo-${todo.id}`, kind: "Todo" as const,
      keywords: text(todo.name, todoStatusLabel(todo.status), "to-do", "todo", "task"),
    }));
  },
};

/** Add a provider here when introducing a new first-party module. */
export const searchProviders: readonly SearchProvider[] = [documents, goals, finance, relationships, customModules, todos];
