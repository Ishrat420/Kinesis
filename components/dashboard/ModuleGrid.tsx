import { Car, FileText, Heart, Landmark, Target, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";

const modules = [
  {
    icon: FileText,
    name: "Documents",
    meta: "12 tracked",
    detail: "2 expiring soon",
    tone: "bg-blue-50",
  },
  {
    icon: Landmark,
    name: "Finance",
    meta: "$147k net worth",
    detail: "4.3% this month",
    tone: "bg-emerald-50",
  },
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
  {
    icon: Target,
    name: "Goals",
    meta: "4 active goals",
    detail: "2 on track",
    tone: "bg-violet-50",
  },
  {
    icon: Users,
    name: "Relationships",
    meta: "24 people",
    detail: "1 birthday soon",
    tone: "bg-sky-50",
  },
];

export function ModuleGrid() {
  return (
    <Card title="Modules" className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;

          return (
            <div
              key={module.name}
              className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
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
            </div>
          );
        })}
      </div>
    </Card>
  );
}