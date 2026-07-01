import { Car, FileText, Heart, Landmark, Target, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";

const modules = [
  { icon: FileText, name: "Documents" },
  { icon: Landmark, name: "Finance" },
  { icon: Heart, name: "Health" },
  { icon: Car, name: "Vehicles" },
  { icon: Target, name: "Goals" },
  { icon: Users, name: "Relationships" },
];

export function ModuleGrid() {
  return (
    <Card title="Modules" className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;

          return (
            <div
              key={module.name}
              className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Icon className="h-5 w-5 text-zinc-700" />
              <p className="mt-4 font-medium">{module.name}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}