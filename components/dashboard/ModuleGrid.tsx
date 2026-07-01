import { Card } from "../ui/Card";

const modules = [
  { icon: "📄", name: "Documents" },
  { icon: "💰", name: "Finance" },
  { icon: "❤️", name: "Health" },
  { icon: "🚗", name: "Vehicles" },
  { icon: "🎯", name: "Goals" },
  { icon: "👥", name: "Relationships" },
];

export function ModuleGrid() {
  return (
    <Card title="Modules" className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <div
            key={module.name}
            className="rounded-xl border border-zinc-200/80 bg-white px-4 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          >
            <span className="text-2xl">{module.icon}</span>
            <p className="mt-3 font-medium">{module.name}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}