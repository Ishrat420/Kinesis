import { Car, FileText, Heart, Shield, BadgeCheck } from "lucide-react";

const upcoming = [
  {
    icon: BadgeCheck,
    title: "Passport expires",
    date: "12 Sep 2026",
    time: "in 156 days",
    priority: "High",
  },
  {
    icon: Car,
    title: "Car registration",
    date: "28 Jun 2025",
    time: "in 50 days",
    priority: "Medium",
  },
  {
    icon: Shield,
    title: "Car insurance",
    date: "30 Jun 2025",
    time: "in 52 days",
    priority: "Medium",
  },
  {
    icon: Heart,
    title: "Annual health check",
    date: "15 Jul 2025",
    time: "in 67 days",
    priority: "Low",
  },
  {
    icon: FileText,
    title: "Home insurance",
    date: "01 Aug 2025",
    time: "in 84 days",
    priority: "Low",
  },
];

export function ReminderList() {
  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Upcoming & Due</h2>
        <button className="text-sm text-zinc-500">View all</button>
      </div>

      <div className="space-y-4">
        {upcoming.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-4"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50">
                <Icon className="h-5 w-5 text-zinc-700" />
              </div>

              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-zinc-500">{item.date}</p>
              </div>

              <p className="text-sm text-zinc-500">{item.time}</p>

              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium">
                {item.priority}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}