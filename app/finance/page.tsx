import { FinanceDashboard } from "./FinanceDashboard";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { getFinanceItems } from "@/lib/data/finance";

export default async function FinancePage() {
  return (
    <ModuleLayout>
      <FinanceDashboard initialItems={await getFinanceItems()} />
    </ModuleLayout>
  );
}
