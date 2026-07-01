const modules = [
  { icon: "📄", name: "Documents" },
  { icon: "💰", name: "Finance" },
  { icon: "❤️", name: "Health" },
  { icon: "🚗", name: "Vehicles" },
  { icon: "🎯", name: "Goals" },
  { icon: "👥", name: "Relationships" },
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-[calc(100vh-4rem)] w-64 border-r border-zinc-200/80 bg-white/80 p-4 md:block">
      <nav className="space-y-1 text-sm">
        <SidebarItem active icon="🏠" label="Dashboard" />

        <Divider />

        {modules.map((module) => (
          <SidebarItem key={module.name} icon={module.icon} label={module.name} />
        ))}

        <button className="mt-3 w-full rounded-xl px-3 py-2 text-left text-zinc-500 hover:bg-zinc-50">
          ➕ Add Module
        </button>

        <Divider />

        <SidebarItem icon="📅" label="Timeline" />
        <SidebarItem icon="⚙️" label="Settings" />
      </nav>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  active = false,
}: {
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`w-full rounded-xl px-3 py-2 text-left ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      }`}
    >
      <span className="mr-2">{icon}</span>
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-3 border border-zinc-200/80-t" />;
}