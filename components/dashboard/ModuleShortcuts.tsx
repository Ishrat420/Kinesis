"use client";

import { FileText, Target } from "lucide-react";
import { type DragEvent, useMemo, useState } from "react";
import { customModuleIcon } from "@/lib/custom-modules/icons";
import { FinanceModuleCard } from "./FinanceModuleCard";
import { ModuleCard } from "./ModuleCard";
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
              <ModuleCard icon={FileText} tone={{ className: "bg-blue-50" }} name="Documents" href="/documents" meta={`${documentCount} tracked`} detail={documentCount ? `${documentsExpiringSoon} expiring soon` : "Add documents to track"} />
            </div>
          );
          if (id === "goals") return (
            <div key={id} {...dragProps(id)} className={wrapperClass}>
              <ModuleCard icon={Target} tone={{ className: "bg-violet-50" }} name="Goals" href="/goals" meta={`${goalCount} active goal${goalCount === 1 ? "" : "s"}`} detail={`${goalsAtRisk} on risk`} />
            </div>
          );
          if (id === "finance") return <div key={id} {...dragProps(id)} className={wrapperClass}><FinanceModuleCard items={financeItems} /></div>;
          if (id === "relationships") return <div key={id} {...dragProps(id)} className={wrapperClass}><RelationshipModuleCard people={relationshipPeople} upcomingDates={relationshipUpcomingDates} /></div>;
          if (!customModule) return null;

          return (
            <div key={id} {...dragProps(id)} className={wrapperClass}>
              <ModuleCard
                icon={customModuleIcon(customModule.icon)}
                tone={{ color: customModule.color }}
                name={customModule.name}
                href={`/custom-modules/${id}`}
                meta={`${customModule.itemCount} ${customModule.name} ${customModule.itemCount === 1 ? "Item" : "Items"}`}
                onRemove={() => removeCustomModule(id)}
              />
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
