"use server";

import { revalidatePath } from "next/cache";
import { addActivity } from "@/lib/data/activity";
import type { FinanceKind } from "@/lib/finance";

const labels: Record<FinanceKind, string> = {
  asset: "Asset",
  liability: "Liability",
  income: "Monthly income",
  expense: "Monthly expenses",
};

export async function recordFinanceActivity(kind: FinanceKind, updated: boolean, name: string) {
  await addActivity({
    action: updated ? "Updated" : "Added",
    moduleName: "Finance",
    objectName: kind === "income" || kind === "expense" ? labels[kind] : name,
    icon: "finance",
    href: "/finance",
  });
  revalidatePath("/");
}
