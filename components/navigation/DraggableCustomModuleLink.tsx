"use client";

import Link from "next/link";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";

const CUSTOM_MODULE_MIME = "application/x-kinesis-custom-module";

export function DraggableCustomModuleLink({ id, name, icon, color }: { id: string; name: string; icon: string; color: string }) {
  return (
    <Link
      href={`/custom-modules/${id}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(CUSTOM_MODULE_MIME, id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      title="Drag to Module Shortcuts"
      className="flex w-full cursor-grab items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-zinc-500 transition duration-200 hover:bg-zinc-100 hover:text-zinc-950 active:cursor-grabbing"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-700" style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}>
        <CustomModuleIcon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 truncate font-medium">{name}</span>
    </Link>
  );
}
