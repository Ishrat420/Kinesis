const activity = [
  {
    icon: "📄",
    title: "Uploaded document: Employment Contract.pdf",
    time: "2h ago",
  },
  {
    icon: "🚗",
    title: "Added vehicle: Toyota Corolla 2020",
    time: "1d ago",
  },
  {
    icon: "✅",
    title: "Completed task: Pay electricity bill",
    time: "2d ago",
  },
  {
    icon: "🎯",
    title: "Added goal: Buy a house",
    time: "3d ago",
  },
  {
    icon: "💰",
    title: "Updated budget: June 2025",
    time: "3d ago",
  },
];

export function ActivityFeed() {
  return (
    <section className="rounded-2xl border border-zinc-200/80 border border-zinc-200/80-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <button className="text-sm text-zinc-500">View all</button>
      </div>

      <div className="space-y-5">
        {activity.map((item) => (
          <div
            key={item.title}
            className="grid grid-cols-[44px_1fr_auto] items-center gap-4"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50">
              {item.icon}
            </div>

            <p className="font-medium text-zinc-700">{item.title}</p>
            <p className="text-sm text-zinc-500">{item.time}</p>
          </div>
        ))}
      </div>
    </section>
  );
}