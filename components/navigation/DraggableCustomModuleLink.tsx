"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { isRouteActive } from "@/lib/navigation/active-route";
import { navItemClassName } from "./nav-item";

const CUSTOM_MODULE_MIME = "application/x-kinesis-custom-module";

export function DraggableCustomModuleLink({ id, name, icon, color }: { id: string; name: string; icon: string; color: string }) {
  const href = `/custom-modules/${id}`;
  const pathname = usePathname();
  const active = isRouteActive(pathname, href);

  return (
    <Link
      href={href}
      draggable
      aria-current={active ? "page" : undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData(CUSTOM_MODULE_MIME, id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      title="Drag to Module Shortcuts"
      className={`${navItemClassName(active)} cursor-grab active:cursor-grabbing`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-700" style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}>
        <CustomModuleIcon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 truncate font-medium">{name}</span>
    </Link>
  );
}
