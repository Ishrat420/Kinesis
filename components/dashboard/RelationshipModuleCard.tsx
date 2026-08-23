"use client";

import Link from "next/link";
import { GripVertical, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type StoredRelationship = { importantDates?: { date: string }[] };

const DEFAULT_PEOPLE_COUNT = 6;
const DEFAULT_IMPORTANT_DATES = ["14 October"];

function dateParts(value: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return { month: Number(iso[2]) - 1, day: Number(iso[3]) };
  const parsed = new Date(`${value} 2000`);
  return Number.isNaN(parsed.valueOf()) ? null : { month: parsed.getMonth(), day: parsed.getDate() };
}

export function countUpcomingImportantDates(values: string[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthFromToday = new Date(today);
  monthFromToday.setMonth(monthFromToday.getMonth() + 1);
  return values.filter((value) => {
    const parts = dateParts(value);
    if (!parts) return false;
    let occurrence = new Date(today.getFullYear(), parts.month, parts.day);
    if (occurrence < today) occurrence = new Date(today.getFullYear() + 1, parts.month, parts.day);
    return occurrence <= monthFromToday;
  }).length;
}

function readSummary() {
  let people = DEFAULT_PEOPLE_COUNT;
  let dates = DEFAULT_IMPORTANT_DATES;
  try {
    const storedPeople = localStorage.getItem("kinesis-relationship-map");
    const storedRelationships = localStorage.getItem("kinesis-relationships");
    if (storedPeople) {
      const parsed = JSON.parse(storedPeople);
      if (Array.isArray(parsed)) people = parsed.length;
    }
    if (storedRelationships) {
      const parsed = JSON.parse(storedRelationships) as StoredRelationship[];
      if (Array.isArray(parsed)) dates = parsed.flatMap((relationship) => relationship.importantDates?.map(({ date }) => date) ?? []);
    }
  } catch { /* Keep a useful summary if local data is malformed. */ }
  return { people, upcomingDates: countUpcomingImportantDates(dates) };
}

export function RelationshipModuleCard() {
  const [summary, setSummary] = useState({ people: DEFAULT_PEOPLE_COUNT, upcomingDates: 0 });
  const refresh = useCallback(() => setSummary(readSummary()), []);
  useEffect(() => {
    const initialRefresh = setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener("kinesis-relationships-updated", refresh);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    let daily: ReturnType<typeof setInterval> | undefined;
    const midnight = setTimeout(() => { refresh(); daily = setInterval(refresh, 86_400_000); }, nextMidnight.getTime() - now.getTime());
    return () => { clearTimeout(initialRefresh); clearTimeout(midnight); if (daily) clearInterval(daily); window.removeEventListener("storage", refresh); window.removeEventListener("kinesis-relationships-updated", refresh); };
  }, [refresh]);
  return <Link href="/relationships" className="group relative block h-full rounded-2xl border border-zinc-200/80 bg-white p-4 pb-10 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50"><Users className="h-[18px] w-[18px] text-zinc-700" /></div><GripVertical className="h-5 w-5 cursor-grab text-zinc-300" aria-label="Drag Relationships" /></div>
    <p className="mt-4 font-semibold text-zinc-900">Relationships</p>
    <p className="mt-1 text-sm text-zinc-500">{summary.people} {summary.people === 1 ? "person" : "people"} · including yourself</p>
    <p className="text-sm text-zinc-400">{summary.upcomingDates ? `${summary.upcomingDates} important date${summary.upcomingDates === 1 ? " is" : "s are"} coming soon` : "No important dates coming soon"}</p>
    <span className="absolute bottom-4 right-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</span>
  </Link>;
}
