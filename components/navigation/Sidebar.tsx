import Image from "next/image";
import Link from "next/link";
import kinesisIcon from "@/app/icon.png";
import {
  Calendar,
  Car,
  FileText,
  Heart,
  Home,
  Landmark,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { AddModuleButton } from "./AddModuleButton";
import { getCustomModules } from "@/lib/data/custom-modules";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";

const modules = [
  { icon: FileText, name: "Documents", href: "/documents" },
  { icon: Landmark, name: "Finance" },
  { icon: Heart, name: "Health" },
  { icon: Car, name: "Vehicles" },
  { icon: Target, name: "Goals", href: "/goals" },
  { icon: Users, name: "Relationships" },
];

export async function Sidebar() {
  const customModules = await getCustomModules();
  return (
    <aside className="hidden min-h-[calc(100vh-72px)] w-[270px] border-r border-zinc-200/80 bg-white px-5 py-5 md:block">
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

      <div className="border-t border-zinc-100 pt-6">
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
                href={"href" in module ? module.href : undefined}
              />
            ))}
            {customModules.map((customModule) => (
              <Link key={customModule.id} href={`/custom-modules/${customModule.id}`} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-zinc-500 transition duration-200 hover:bg-zinc-100 hover:text-zinc-950">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ backgroundColor: customModule.color }}><CustomModuleIcon name={customModule.icon} className="h-4 w-4" /></span>
                <span className="min-w-0 truncate font-medium">{customModule.name}</span>
              </Link>
            ))}
          </NavSection>

          <NavSection label="Customize">
            <AddModuleButton />
          </NavSection>

          <NavSection label="System">
            <SidebarItem icon={Calendar} label="Timeline" />
            <SidebarItem icon={Settings} label="Settings" />
          </NavSection>
        </nav>
      </div>
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
  href,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  href?: string;
}) {
  const className = `flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-200 ${
        active
          ? "bg-zinc-950 text-white shadow-[0_8px_24px_rgb(0,0,0,0.12)]"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      }`;
  const content = (
    <>
      <Icon className="h-[18px] w-[18px]" />
      <span className="font-medium">{label}</span>
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className}>
      {content}
    </button>
  );
}
