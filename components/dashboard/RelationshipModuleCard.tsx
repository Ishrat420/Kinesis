import { Users } from "lucide-react";
import { ModuleCard } from "./ModuleCard";

export function RelationshipModuleCard({ people, upcomingDates }: { people: number; upcomingDates: number }) {
  return (
    <ModuleCard
      icon={Users}
      tone={{ className: "bg-sky-50" }}
      name="Relationships"
      href="/relationships"
      meta={`${people} ${people === 1 ? "person" : "people"} · including yourself`}
      detail={upcomingDates ? `${upcomingDates} important date${upcomingDates === 1 ? " is" : "s are"} coming soon` : "No important dates coming soon"}
    />
  );
}
