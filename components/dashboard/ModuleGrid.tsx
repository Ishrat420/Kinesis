import { Card } from "@/components/ui/Card";
import { getCustomModulesWithItemCount } from "@/lib/data/custom-modules";
import { getDocumentSummary } from "@/lib/data/documents";
import { getGoalDashboardSummary } from "@/lib/data/goals";
import { ModuleShortcuts } from "./ModuleShortcuts";
import { getFinanceItems } from "@/lib/data/finance";
import { getRelationshipMap } from "@/lib/data/relationships";
import { getUpcomingAndDue } from "@/lib/data/upcoming";
import { getSettings } from "@/lib/data/settings";
import { resolveDashboardOrder } from "@/lib/dashboard/module-order";

export async function ModuleGrid() {
  const [documentSummary, goalSummary, customModules, financeItems, relationshipMap, upcoming, settings] = await Promise.all([
    getDocumentSummary(),
    getGoalDashboardSummary(),
    getCustomModulesWithItemCount(),
    getFinanceItems(),
    getRelationshipMap(),
    getUpcomingAndDue(),
    getSettings(),
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
        // Reconciled here, not just carried through: a custom module named
        // in the saved order can have been deleted since, and the grid must
        // never render a slot for a module that no longer exists.
        initialOrder={resolveDashboardOrder(settings.dashboardModuleOrder, new Set(customModules.map((module) => module.id)))}
      />
    </Card>
  );
}
