import { Users } from "lucide-react";
import { ModuleCard } from "./ModuleCard";
import type { ModuleCardProps } from "./ModuleCard";

export function RelationshipModuleCard({ people, upcomingDates, gripHandlers }: { people: number; upcomingDates: number; gripHandlers?: ModuleCardProps["gripHandlers"] }) {
  return (
    <ModuleCard
      icon={Users}
      tone={{ className: "bg-rose-50" }}
      name="Relationships"
      href="/relationships"
      meta={`${people} ${people === 1 ? "person" : "people"} · including yourself`}
      detail={upcomingDates ? `${upcomingDates} important date${upcomingDates === 1 ? " is" : "s are"} coming soon` : "No important dates coming soon"}
      gripHandlers={gripHandlers}
    />
  );
}
