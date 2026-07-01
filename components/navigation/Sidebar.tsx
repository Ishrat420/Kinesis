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
    <aside className="hidden min-h-[calc(100vh-4rem)] w-72 border-r border-zinc-200/80 bg-white p-4 md:block">
      <nav className="space-y-1 text-sm">
        <SidebarItem active icon={Home} label="Dashboard" />

        <Divider />

        {modules.map((module) => (
          <SidebarItem key={module.name} icon={module.icon} label={module.name} />
        ))}

        <button className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950">
          <Plus className="h-4 w-4" />
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
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${
        active
          ? "bg-zinc-950 text-white"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-3 border-t border-zinc-200/80" />;
}