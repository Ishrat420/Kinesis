"use client";

import Link from "next/link";
import { CalendarDays, FileText, Flag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { UpcomingItem } from "@/lib/data/upcoming";

type StoredPerson = { id: string; name: string; detail?: string };
type StoredRelationship = {
  id: string;
  from: string;
  to: string;
  importantDates?: { label: string; date: string }[];
};

type RelationshipItem = Omit<UpcomingItem, "kind"> & { kind: "relationship" };

function upcomingOccurrence(value: string, now: Date) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = iso
    ? { month: Number(iso[2]) - 1, day: Number(iso[3]) }
    : (() => {
        const date = new Date(`${value} 2000`);
        return Number.isNaN(date.valueOf()) ? null : { month: date.getMonth(), day: date.getDate() };
      })();
  if (!parsed) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let occurrence = new Date(today.getFullYear(), parsed.month, parsed.day);
  if (occurrence < today) occurrence = new Date(today.getFullYear() + 1, parsed.month, parsed.day);
  const oneMonthFromToday = new Date(today);
  oneMonthFromToday.setMonth(oneMonthFromToday.getMonth() + 1);
  return occurrence <= oneMonthFromToday ? occurrence : null;
}

function possessive(name: string) {
  return `${name}${name.toLocaleLowerCase().endsWith("s") ? "'" : "'s"}`;
}

function readRelationshipItems(now = new Date()): RelationshipItem[] {
  try {
    const people = JSON.parse(localStorage.getItem("kinesis-relationship-map") ?? "[]") as StoredPerson[];
    const relationships = JSON.parse(localStorage.getItem("kinesis-relationships") ?? "[]") as StoredRelationship[];
    if (!Array.isArray(people) || !Array.isArray(relationships)) return [];
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const self = people.find((person) => person.detail === "You") ?? people[0];

    return relationships.flatMap((relationship) => {
      const personId = relationship.from === self?.id ? relationship.to : relationship.from;
      const personName = peopleById.get(personId)?.name ?? "Someone";
      return (relationship.importantDates ?? []).flatMap((importantDate, index): RelationshipItem[] => {
        const occurrence = upcomingOccurrence(importantDate.date, now);
        if (!occurrence) return [];
        return [{
          id: `relationship-${relationship.id}-${index}`,
          kind: "relationship",
          title: `${possessive(personName)} ${importantDate.label} is coming`,
          date: occurrence.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          timestamp: occurrence.getTime(),
          href: "/relationships",
        }];
      });
    });
  } catch {
    return [];
  }
}

const icons = { document: FileText, milestone: Flag, relationship: CalendarDays };

export function ReminderList({ items }: { items: UpcomingItem[] }) {
  const [relationshipItems, setRelationshipItems] = useState<RelationshipItem[]>([]);

  useEffect(() => {
    const refresh = () => setRelationshipItems(readRelationshipItems());
    const initialRefresh = setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener("kinesis-relationships-updated", refresh);
    return () => {
      clearTimeout(initialRefresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("kinesis-relationships-updated", refresh);
    };
  }, []);

  const upcoming = useMemo(
    () => [...items, ...relationshipItems].sort((a, b) => a.timestamp - b.timestamp),
    [items, relationshipItems],
  );

  return (
    <section className="flex h-[396px] flex-col rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold">Upcoming &amp; Due</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {upcoming.length ? <div className="space-y-4">
          {upcoming.map((item) => {
            const Icon = icons[item.kind];
            return (
              <Link key={item.id} href={item.href} className="grid grid-cols-[44px_1fr] items-center gap-4 rounded-xl transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-700">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50">
                  <Icon className="h-5 w-5 text-zinc-700" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-zinc-800">{item.title}</p>
                  <p className="text-sm text-zinc-500">{item.date}</p>
                </div>
              </Link>
            );
          })}
        </div> : <div className="flex h-full items-center justify-center text-center text-sm text-zinc-400">Nothing is upcoming or overdue.</div>}
      </div>
    </section>
  );
}
