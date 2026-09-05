import Image from "next/image";
import kinesisIcon from "@/app/icon.png";
import {
  Calendar,
  FileText,
  Home,
  Landmark,
  ListTodo,
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
    <nav aria-label="Main navigation" className="flex flex-col gap-5 text-sm">
      {/*
        Overview holds the places you go to decide what to do next — the
        Dashboard, the To-Dos, the Calendar. ADR-009 is explicit that modules
        answer "what do I have?" while actions answer "what needs me now?", and
        those are different questions, so the two stay in separate groups.
      */}
      <NavSection label="Overview">
        <SidebarNavLink href="/" label="Dashboard" icon={<Home className="h-[18px] w-[18px]" />} />
        <SidebarNavLink href="/todos" label="To-Dos" icon={<ListTodo className="h-[18px] w-[18px]" />} />
        <SidebarNavLink href="/calendar" label="Calendar" icon={<Calendar className="h-[18px] w-[18px]" />} />
      </NavSection>

      {/*
        Adding a module is an action on this list, so its control closes the
        list instead of standing in a "Customize" group of one.
      */}
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
        <AddModuleButton />
      </NavSection>

      <NavSection label="System">
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
