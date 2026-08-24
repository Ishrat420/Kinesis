import { FinanceDashboard } from "./FinanceDashboard";
import { getFinanceItems } from "@/lib/data/finance";

export default async function FinancePage() {
  return <FinanceDashboard initialItems={await getFinanceItems()} />;
}
