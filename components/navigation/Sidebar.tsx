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
    <aside className="hidden min-h-[calc(100vh-72px)] w-[300px] border-r border-zinc-200/80 bg-white px-5 py-6 md:block">
      <div className="mb-7 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-bold text-white">
          K
        </div>
        <div>
          <p className="text-base font-semibold tracking-tight">Kinesis</p>
          <p className="text-xs text-zinc-400">Life in motion</p>
        </div>
      </div>

      <nav className="space-y-1 text-sm">
        <SidebarItem active icon={Home} label="Dashboard" />

        <Divider />

        {modules.map((module) => (
          <SidebarItem key={module.name} icon={module.icon} label={module.name} />
        ))}

        <button className="mt-3 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950">
          <Plus className="h-[18px] w-[18px]" />
          Add Module
        </button>

        <Divider />

        <SidebarItem icon={Calendar} label="Timeline" />
        <SidebarItem icon={Settings} label="Settings" />
      </nav>
    </aside>
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
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
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

function Divider() {
  return <div className="my-5 border-t border-zinc-200/80" />;
}