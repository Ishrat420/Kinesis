import {
  Calendar,
  CheckSquare,
  Flag,
  Target,
  TrendingUp,
} from "lucide-react";

const stats = [
  {
    icon: Flag,
    title: "Needs attention",
    value: "5",
    label: "items",
    tone: "bg-amber-50",
  },
  {
    icon: Calendar,
    title: "Expiring soon",
    value: "3",
    label: "items",
    tone: "bg-blue-50",
  },
  {
    icon: CheckSquare,
    title: "Tasks due",
    value: "7",
    label: "tasks",
    tone: "bg-emerald-50",
  },
  {
    icon: Target,
    title: "Goals progress",
    value: "2",
    label: "on track",
    tone: "bg-violet-50",
  },
  {
    icon: TrendingUp,
    title: "This month",
    value: "$4,230",
    label: "net cash flow",
    tone: "bg-teal-50",
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
            className="group rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_rgb(0,0,0,0.08)]"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-2xl ${stat.tone}`}
              >
                <Icon className="h-[18px] w-[18px] text-zinc-700" />
              </div>
              <p className="text-sm font-semibold text-zinc-700">
                {stat.title}
              </p>
            </div>

            <div className="mt-6 flex items-end gap-2">
              <p className="text-[38px] font-semibold leading-none tracking-tight">
                {stat.value}
              </p>
              <p className="pb-1 text-sm text-zinc-500">{stat.label}</p>
            </div>

            <p className="mt-6 text-sm font-medium text-zinc-500 transition group-hover:text-zinc-900">
              See all →
            </p>
          </section>
        );
      })}
    </div>
  );
}