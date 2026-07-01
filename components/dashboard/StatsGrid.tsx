import {
  Calendar,
  CheckSquare,
  Flag,
  Target,
  TrendingUp,
} from "lucide-react";

const stats = [
  { icon: Flag, title: "Needs attention", value: "5", label: "items" },
  { icon: Calendar, title: "Expiring soon", value: "3", label: "items" },
  { icon: CheckSquare, title: "Tasks due", value: "7", label: "tasks" },
  { icon: Target, title: "Goals progress", value: "2", label: "on track" },
  {
    icon: TrendingUp,
    title: "This month",
    value: "$4,230",
    label: "net cash flow",
  },
];

export function StatsGrid() {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <section
            key={stat.title}
            className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)]"
          >
            <div className="flex items-center gap-3 text-zinc-700">
              <Icon className="h-5 w-5" />
              <p className="text-sm font-medium">{stat.title}</p>
            </div>

            <div className="mt-6 flex items-end gap-2">
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="pb-1 text-sm text-zinc-500">{stat.label}</p>
            </div>

            <p className="mt-6 text-sm font-medium text-zinc-500">See all →</p>
          </section>
        );
      })}
    </div>
  );
}