import {
  Calendar,
  Car,
  FileText,
  Heart,
  Home,
  Landmark,
  Plus,
  Settings,
  Target,
  Users,
} from "lucide-react";

const modules = [
  { icon: FileText, name: "Documents" },
  { icon: Landmark, name: "Finance" },
  { icon: Heart, name: "Health" },
  { icon: Car, name: "Vehicles" },
  { icon: Target, name: "Goals" },
  { icon: Users, name: "Relationships" },
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-[calc(100vh-72px)] w-[300px] border-r border-zinc-200/80 bg-white px-5 py-5 md:block">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-bold text-white">
          K
        </div>
        <div>
          <p className="text-base font-semibold tracking-tight">Kinesis</p>
          <p className="text-xs text-zinc-400">Life in motion</p>
        </div>
      </div>

      <nav className="space-y-5 text-sm">
        <NavSection label="Main">
          <SidebarItem active icon={Home} label="Dashboard" />
        </NavSection>

        <NavSection label="Areas">
          {modules.map((module) => (
            <SidebarItem
              key={module.name}
              icon={module.icon}
              label={module.name}
            />
          ))}
        </NavSection>

        <NavSection label="Customize">
          <SidebarItem icon={Plus} label="Add Module" />
        </NavSection>

        <NavSection label="System">
          <SidebarItem icon={Calendar} label="Timeline" />
          <SidebarItem icon={Settings} label="Settings" />
        </NavSection>
      </nav>
    </aside>
  );
}

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-200 ${
        active
          ? "bg-zinc-950 text-white shadow-sm"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="font-medium">{label}</span>
    </button>
  );
}