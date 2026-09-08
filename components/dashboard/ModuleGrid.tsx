import { Card } from "@/components/ui/Card";
import { getCustomModulesWithItemCount } from "@/lib/data/custom-modules";
import { getDocumentSummary } from "@/lib/data/documents";
import { getGoalDashboardSummary } from "@/lib/data/goals";
import { ModuleShortcuts } from "./ModuleShortcuts";
import { getFinanceItems } from "@/lib/data/finance";
import { getRelationshipMap } from "@/lib/data/relationships";
import { getUpcomingAndDue } from "@/lib/data/upcoming";

export async function ModuleGrid() {
  const [documentSummary, goalSummary, customModules, financeItems, relationshipMap, upcoming] = await Promise.all([
    getDocumentSummary(),
    getGoalDashboardSummary(),
    getCustomModulesWithItemCount(),
    getFinanceItems(),
    getRelationshipMap(),
    getUpcomingAndDue(),
  ]);

  return (
    <Card title="Module Shortcuts" className="mt-5">
      <ModuleShortcuts
        documentCount={documentSummary.tracked}
        documentsExpiringSoon={documentSummary.expiringSoon}
        goalCount={goalSummary.active}
        goalsAtRisk={goalSummary.atRisk}
        financeItems={financeItems}
        relationshipPeople={relationshipMap.people.length}
        // Reuses the same "next occurrence within the reminder window" logic
        // the Upcoming & Due list runs, rather than counting every important
        // date ever recorded (which included past dates and left out
        // self-person dates entirely).
        relationshipUpcomingDates={upcoming.filter((item) => item.kind === "relationship").length}
        customModules={customModules.map((module) => ({
          id: module.id,
          name: module.name,
          icon: module.icon,
          color: module.color,
          itemCount: module._count.items,
        }))}
      />
    </Card>
  );
}
