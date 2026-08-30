import { FinanceDashboard } from "./FinanceDashboard";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { getFinanceItems } from "@/lib/data/finance";

export default async function FinancePage() {
  return (
    <ModuleContent>
      <FinanceDashboard initialItems={await getFinanceItems()} />
    </ModuleContent>
  );
}
