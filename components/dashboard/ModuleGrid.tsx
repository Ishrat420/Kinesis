import { Card } from "@/components/ui/Card";
import { getCustomModulesWithItemCount } from "@/lib/data/custom-modules";
import { getDocumentSummary } from "@/lib/data/documents";
import { getGoalDashboardSummary } from "@/lib/data/goals";
import { ModuleShortcuts } from "./ModuleShortcuts";

export async function ModuleGrid() {
  const [documentSummary, goalSummary, customModules] = await Promise.all([
    getDocumentSummary(),
    getGoalDashboardSummary(),
    getCustomModulesWithItemCount(),
  ]);

  return (
    <Card title="Module Shortcuts" className="mt-5">
      <ModuleShortcuts
        documentCount={documentSummary.tracked}
        goalCount={goalSummary.active}
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
