import { prisma } from "@/lib/data/prisma";
import type { SearchProvider } from "./types";

const contains = (query: string) => ({ contains: query, mode: "insensitive" as const });
const candidateTerm = (query: string) => query.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? query;

export const coreSearchProviders: SearchProvider[] = [
  {
    id: "documents",
    async search(query) {
      query = candidateTerm(query);
      const rows = await prisma.document.findMany({
        where: { OR: [{ name: contains(query) }, { type: contains(query) }, { status: contains(query) }, { notes: contains(query) }, { documentNumber: contains(query) }, { customFields: { some: { OR: [{ label: contains(query) }, { value: contains(query) }] } } }] },
        include: { customFields: { select: { label: true, value: true } } }, take: 30,
      });
      return rows.map((row) => ({ id: `document:${row.id}`, title: row.name, subtitle: `${row.type} · ${row.status}`, href: `/documents/${row.id}`, keywords: [row.name, row.type, row.status, row.notes, row.documentNumber, ...row.customFields.flatMap((field) => [field.label, field.value])].filter((value): value is string => Boolean(value)), kind: "Document", icon: "document" as const }));
    },
  },
  {
    id: "goals",
    async search(query) {
      query = candidateTerm(query);
      const rows = await prisma.goal.findMany({ where: { OR: [{ name: contains(query) }, { status: contains(query) }, { note: contains(query) }, { milestones: { some: { name: contains(query) } } }] }, include: { milestones: { select: { name: true } } }, take: 30 });
      return rows.map((row) => ({ id: `goal:${row.id}`, title: row.name, subtitle: `${row.status} goal`, href: `/goals/${row.id}`, keywords: [row.name, row.status, row.note, ...row.milestones.map(({ name }) => name)].filter((value): value is string => Boolean(value)), kind: "Goal", icon: "goal" as const }));
    },
  },
  {
    id: "finance",
    async search(query) {
      query = candidateTerm(query);
      const numericQuery = Number(query.replace(/[$,]/g, ""));
      const rows = await prisma.financeItem.findMany({ where: { OR: [{ name: contains(query) }, { kind: contains(query) }, { category: contains(query) }, { notes: contains(query) }, ...(Number.isFinite(numericQuery) ? [{ amount: numericQuery }] : [])] }, take: 30 });
      return rows.map((row) => ({ id: `finance:${row.id}`, title: row.name, subtitle: `${row.category || row.kind} · $${row.amount.toLocaleString("en-AU")}`, href: "/finance", keywords: [row.name, row.kind, row.category, row.notes, String(row.amount)].filter((value): value is string => Boolean(value)), kind: "Finance", icon: "finance" as const }));
    },
  },
  {
    id: "relationships",
    async search(query) {
      query = candidateTerm(query);
      const people = await prisma.person.findMany({ where: { OR: [{ name: contains(query) }, { category: contains(query) }] }, take: 30 });
      const relationships = await prisma.relationship.findMany({ where: { OR: [{ type: contains(query) }, { notes: contains(query) }, { firstPerson: { name: contains(query) } }, { secondPerson: { name: contains(query) } }, { practices: { some: { title: contains(query) } } }, { reflections: { some: { text: contains(query) } } }, { importantDates: { some: { label: contains(query) } } }] }, include: { firstPerson: { select: { name: true } }, secondPerson: { select: { name: true } }, practices: { select: { title: true } }, reflections: { select: { text: true } }, importantDates: { select: { label: true } } }, take: 30 });
      return [
        ...people.map((person) => ({ id: `person:${person.id}`, title: person.name, subtitle: person.category || (person.isSelf ? "You" : "Relationship"), href: "/relationships", keywords: [person.name, person.category, "person", "relationship"].filter((value): value is string => Boolean(value)), kind: "Relationship", icon: "relationship" as const })),
        ...relationships.map((row) => ({ id: `relationship:${row.id}`, title: `${row.firstPerson.name} & ${row.secondPerson.name}`, subtitle: row.type || "Relationship", href: "/relationships", keywords: [row.firstPerson.name, row.secondPerson.name, row.type, row.notes, ...row.practices.map(({ title }) => title), ...row.reflections.map(({ text }) => text), ...row.importantDates.map(({ label }) => label)].filter((value): value is string => Boolean(value)), kind: "Relationship", icon: "relationship" as const })),
      ];
    },
  },
  {
    // One provider covers every user-defined module, including fields added later.
    id: "custom-modules",
    async search(query) {
      query = candidateTerm(query);
      const rows = await prisma.customItem.findMany({ where: { archived: false, OR: [{ name: contains(query) }, { notes: contains(query) }, { link: contains(query) }, { module: { name: contains(query) } }, { fields: { some: { OR: [{ label: contains(query) }, { value: contains(query) }] } } }] }, include: { module: { select: { id: true, name: true, icon: true } }, fields: { select: { label: true, value: true } } }, take: 40 });
      return rows.map((row) => ({ id: `custom:${row.id}`, title: row.name, subtitle: row.module.name, href: `/custom-modules/${row.module.id}/items/${row.id}`, keywords: [row.name, row.notes, row.link, row.module.name, ...row.fields.flatMap((field) => [field.label, field.value])].filter((value): value is string => Boolean(value)), kind: row.module.name, icon: "custom" as const, iconName: row.module.icon }));
    },
  },
];
