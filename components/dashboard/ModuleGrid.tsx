import { Car, FileText, Heart, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getDocumentSummary } from "@/lib/data/documents";
import { getGoalDashboardSummary } from "@/lib/data/goals";
import Link from "next/link";
import { RelationshipModuleCard } from "./RelationshipModuleCard";
import { FinanceModuleCard } from "./FinanceModuleCard";

const modules = [
  {
    icon: Heart,
    name: "Health",
    meta: "3 active records",
    detail: "1 appointment due",
    tone: "bg-rose-50",
  },
  {
    icon: Car,
    name: "Vehicles",
    meta: "Toyota Corolla",
    detail: "Service due soon",
    tone: "bg-amber-50",
  },
];

export async function ModuleGrid() {
  const [documentSummary, goalSummary] = await Promise.all([
    getDocumentSummary(),
    getGoalDashboardSummary(),
  ]);
  const documentModule = {
    icon: FileText,
    name: "Documents",
    meta: `${documentSummary.tracked} tracked`,
    detail: documentSummary.tracked
      ? `${documentSummary.expiringSoon} expiring soon`
      : "Add documents to track",
    tone: "bg-blue-50",
  };
  const goalModule = {
    icon: Target,
    name: "Goals",
    meta: `${goalSummary.active} active goal${goalSummary.active === 1 ? "" : "s"}`,
    detail: `${goalSummary.onTrack} on track`,
    tone: "bg-violet-50",
  };

  return (
    <Card title="Modules" className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[documentModule, ...modules, goalModule].map((module) => {
          const Icon = module.icon;
          const content = (
            <>
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${module.tone}`}
                >
                  <Icon className="h-[18px] w-[18px] text-zinc-700" />
                </div>

                <span className="text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">
                  →
                </span>
              </div>

              <p className="mt-4 font-semibold text-zinc-900">{module.name}</p>
              <p className="mt-1 text-sm text-zinc-500">{module.meta}</p>
              <p className="text-sm text-zinc-400">{module.detail}</p>
            </>
          );

          return module.name === "Documents" || module.name === "Goals" ? (
            <Link
              key={module.name}
              href={module.name === "Goals" ? "/goals" : "/documents"}
              className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              {content}
            </Link>
          ) : (
            <div
              key={module.name}
              className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm"
            >
              {content}
            </div>
          );
        })}
        <FinanceModuleCard />
        <RelationshipModuleCard />
      </div>
    </Card>
  );
}
