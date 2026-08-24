"use client";

import Link from "next/link";
import { FileText, GripVertical, Target, X } from "lucide-react";
import { type DragEvent, useMemo, useState } from "react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { FinanceModuleCard } from "./FinanceModuleCard";
import { RelationshipModuleCard } from "./RelationshipModuleCard";
import type { FinanceItem } from "@/lib/finance";

const CUSTOM_MODULE_MIME = "application/x-kinesis-custom-module";
const SYSTEM_IDS = ["documents", "goals", "finance", "relationships"] as const;
const MAX_CUSTOM_MODULES = 2;

type CustomModuleSummary = {
  id: string;
  name: string;
  icon: string;
  color: string;
  itemCount: number;
};

type ModuleShortcutsProps = {
  documentCount: number;
  documentsExpiringSoon: number;
  goalCount: number;
  goalsAtRisk: number;
  customModules: CustomModuleSummary[];
  financeItems: FinanceItem[];
  relationshipPeople: number;
  relationshipUpcomingDates: number;
};

export function ModuleShortcuts({ documentCount, documentsExpiringSoon, goalCount, goalsAtRisk, customModules, financeItems, relationshipPeople, relationshipUpcomingDates }: ModuleShortcutsProps) {
  const [order, setOrder] = useState<string[]>([...SYSTEM_IDS]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const customIds = useMemo(() => new Set(customModules.map(({ id }) => id)), [customModules]);
  const selectedCustomCount = order.filter((id) => customIds.has(id)).length;

  function saveOrder(nextOrder: string[]) {
    setOrder(nextOrder);
  }

  function reorder(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const nextOrder = order.filter((id) => id !== draggedId);
    nextOrder.splice(nextOrder.indexOf(targetId), 0, draggedId);
    saveOrder(nextOrder);
  }

  function addCustomModule(event: DragEvent) {
    event.preventDefault();
    if (draggedId || selectedCustomCount >= MAX_CUSTOM_MODULES) return;
    const id = event.dataTransfer.getData(CUSTOM_MODULE_MIME);
    if (!customIds.has(id) || order.includes(id)) return;
    saveOrder([...order, id]);
  }

  function removeCustomModule(id: string) {
    saveOrder(order.filter((moduleId) => moduleId !== id));
  }

  function dragProps(id: string) {
    return {
      draggable: true,
      onDragStart: () => setDraggedId(id),
      onDragEnd: () => setDraggedId(null),
      onDragOver: (event: DragEvent) => event.preventDefault(),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (draggedId) reorder(id);
        else addCustomModule(event);
      },
    };
  }

  return (
    <div
      onDragOver={(event) => {
        if (selectedCustomCount < MAX_CUSTOM_MODULES) event.preventDefault();
      }}
      onDrop={addCustomModule}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((id) => {
          const customModule = customModules.find((module) => module.id === id);
          const wrapperClass = `relative h-full ${draggedId === id ? "opacity-60" : ""}`;

          if (id === "documents") return (
            <div key={id} {...dragProps(id)} className={wrapperClass}>
              <SystemCard icon={FileText} tone="bg-blue-50" name="Documents" href="/documents" meta={`${documentCount} tracked`} detail={documentCount ? `${documentsExpiringSoon} expiring soon` : "Add documents to track"} />
            </div>
          );
          if (id === "goals") return (
            <div key={id} {...dragProps(id)} className={wrapperClass}>
              <SystemCard icon={Target} tone="bg-violet-50" name="Goals" href="/goals" meta={`${goalCount} active goal${goalCount === 1 ? "" : "s"}`} detail={`${goalsAtRisk} on risk`} />
            </div>
          );
          if (id === "finance") return <div key={id} {...dragProps(id)} className={wrapperClass}><FinanceModuleCard items={financeItems} /></div>;
          if (id === "relationships") return <div key={id} {...dragProps(id)} className={wrapperClass}><RelationshipModuleCard people={relationshipPeople} upcomingDates={relationshipUpcomingDates} /></div>;
          if (!customModule) return null;

          return (
            <div key={id} {...dragProps(id)} className={wrapperClass}>
              <div className="group relative h-full rounded-2xl border border-zinc-200/80 bg-white p-4 pb-10 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-700" style={{ backgroundColor: `color-mix(in srgb, ${customModule.color} 10%, white)` }}>
                    <CustomModuleIcon name={customModule.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <div className="flex items-center gap-1">
                    <GripVertical className="h-5 w-5 cursor-grab text-zinc-300" aria-label={`Drag ${customModule.name}`} />
                    <button type="button" onClick={() => removeCustomModule(id)} aria-label={`Remove ${customModule.name} shortcut`} className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <Link href={`/custom-modules/${id}`} className="mt-4 block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
                  <p className="font-semibold text-zinc-900">{customModule.name}</p>
                  <p className="mt-1 text-sm text-zinc-500">{customModule.itemCount} {customModule.name} {customModule.itemCount === 1 ? "Item" : "Items"}</p>
                </Link>
                <span className="absolute bottom-4 right-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</span>
              </div>
            </div>
          );
        })}
      </div>
      {selectedCustomCount < MAX_CUSTOM_MODULES && (
        <div className="mt-3 rounded-2xl border border-dashed border-zinc-100 px-4 py-2.5 text-center text-[11px] text-zinc-300">
          Drop a custom module here · {MAX_CUSTOM_MODULES - selectedCustomCount} slots available
        </div>
      )}
    </div>
  );
}

function SystemCard({ icon: Icon, tone, name, href, meta, detail }: { icon: React.ElementType; tone: string; name: string; href: string; meta: string; detail: string }) {
  return (
    <Link href={href} className="group relative block h-full rounded-2xl border border-zinc-200/80 bg-white p-4 pb-10 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-[18px] w-[18px] text-zinc-700" /></div>
        <GripVertical className="h-5 w-5 cursor-grab text-zinc-300" aria-label={`Drag ${name}`} />
      </div>
      <p className="mt-4 font-semibold text-zinc-900">{name}</p>
      <p className="mt-1 text-sm text-zinc-500">{meta}</p>
      <p className="text-sm text-zinc-400">{detail}</p>
      <span className="absolute bottom-4 right-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</span>
    </Link>
  );
}
