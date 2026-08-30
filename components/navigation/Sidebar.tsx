import Image from "next/image";
import kinesisIcon from "@/app/icon.png";
import {
  Calendar,
  FileText,
  Home,
  Landmark,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { AddModuleButton } from "./AddModuleButton";
import { getCustomModules } from "@/lib/data/custom-modules";
import { DraggableCustomModuleLink } from "./DraggableCustomModuleLink";
import { SidebarNavLink } from "./SidebarNavLink";

const modules = [
  { icon: FileText, name: "Documents", href: "/documents" },
  { icon: Landmark, name: "Finance", href: "/finance" },
  { icon: Target, name: "Goals", href: "/goals" },
  { icon: Users, name: "Relationships", href: "/relationships" },
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-[calc(100vh-72px)] w-[270px] shrink-0 border-r border-zinc-200/80 bg-white px-5 py-5 md:block">
      <SidebarBrand />

      <div className="border-t border-zinc-100 pt-6">
        <SidebarNav />
      </div>
    </aside>
  );
}

export function SidebarBrand() {
  return (
    <div className="mb-6 flex items-center gap-4 px-2">
      <Image
        src={kinesisIcon}
        alt="Kinesis"
        width={52}
        height={52}
        className="rounded-2xl shadow-sm"
        priority
      />

      <div>
        <h2 className="text-[28px] font-semibold leading-none tracking-tight">
          Kinesis
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Life in motion</p>
      </div>
    </div>
  );
}

export async function SidebarNav() {
  const customModules = await getCustomModules();

  return (
    <nav aria-label="Main navigation" className="space-y-5 text-sm">
      <NavSection label="Main">
        <SidebarNavLink href="/" label="Dashboard" icon={<Home className="h-[18px] w-[18px]" />} />
      </NavSection>

      <NavSection label="Modules">
        {modules.map((module) => (
          <SidebarNavLink
            key={module.name}
            href={module.href}
            label={module.name}
            icon={<module.icon className="h-[18px] w-[18px]" />}
          />
        ))}
        {customModules.map((customModule) => (
          <DraggableCustomModuleLink key={customModule.id} id={customModule.id} name={customModule.name} icon={customModule.icon} color={customModule.color} />
        ))}
      </NavSection>

      <NavSection label="Customize">
        <AddModuleButton />
      </NavSection>

      <NavSection label="System">
        <SidebarNavLink href="/calendar" label="Calendar" icon={<Calendar className="h-[18px] w-[18px]" />} />
        <SidebarNavLink href="/settings" label="Settings" icon={<Settings className="h-[18px] w-[18px]" />} />
      </NavSection>
    </nav>
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
