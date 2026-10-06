"use client";

import { FileText, Plus, Target } from "lucide-react";
import { type DragEvent, type PointerEvent as ReactPointerEvent, useMemo, useRef, useState, useTransition } from "react";
import { customModuleIcon } from "@/lib/custom-modules/icons";
import { FinanceModuleCard } from "./FinanceModuleCard";
import { ModuleCard } from "./ModuleCard";
import { RelationshipModuleCard } from "./RelationshipModuleCard";
import type { FinanceItem } from "@/lib/finance";
import { updateDashboardModuleOrderAction } from "@/app/(app)/settings/actions";
import { addableCustomModules, MAX_CUSTOM_DASHBOARD_MODULES, moveId } from "@/lib/dashboard/module-order";
import { BottomSheet } from "@/components/overlay/BottomSheet";

const CUSTOM_MODULE_MIME = "application/x-kinesis-custom-module";

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
  /** Already reconciled against what still exists -- see resolveDashboardOrder in ModuleGrid. */
  initialOrder: string[];
};

export function ModuleShortcuts({ documentCount, documentsExpiringSoon, goalCount, goalsAtRisk, customModules, financeItems, relationshipPeople, relationshipUpcomingDates, initialOrder }: ModuleShortcutsProps) {
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [saveFailed, setSaveFailed] = useState(false);
  const customIds = useMemo(() => new Set(customModules.map(({ id }) => id)), [customModules]);
  const selectedCustomCount = order.filter((id) => customIds.has(id)).length;
  const slotsLeft = MAX_CUSTOM_DASHBOARD_MODULES - selectedCustomCount;
  const [adding, setAdding] = useState(false);

  // A touch drag never fires HTML5's dragstart/dragover/drop, so it tracks
  // its own pointer instead -- which card started it, and what the order was
  // then, so a tap that never actually moved anything skips the save below.
  const activePointerId = useRef<number | null>(null);
  const dragStartOrderRef = useRef<string[] | null>(null);

  function persistOrder(nextOrder: string[]) {
    startSaving(async () => {
      const result = await updateDashboardModuleOrderAction(nextOrder);
      setSaveFailed(Boolean(result.error));
    });
  }

  // Applied locally first so dragging feels instant; the save that follows
  // can fail without undoing it; the grid just says so rather than silently
  // losing the change back to whatever was last written.
  function saveOrder(nextOrder: string[]) {
    setOrder(nextOrder);
    persistOrder(nextOrder);
  }

  function reorder(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    saveOrder(moveId(order, draggedId, targetId));
  }

  function addCustomModuleById(id: string) {
    if (selectedCustomCount >= MAX_CUSTOM_DASHBOARD_MODULES) return;
    if (!customIds.has(id) || order.includes(id)) return;
    saveOrder([...order, id]);
  }

  function addCustomModule(event: DragEvent) {
    event.preventDefault();
    if (draggedId) return;
    addCustomModuleById(event.dataTransfer.getData(CUSTOM_MODULE_MIME));
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

  function endGripDrag(event: ReactPointerEvent) {
    if (event.pointerId !== activePointerId.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointerId.current = null;
    setDraggedId(null);
    const startOrder = dragStartOrderRef.current;
    dragStartOrderRef.current = null;
    if (startOrder && (startOrder.length !== order.length || startOrder.some((id, index) => id !== order[index]))) {
      persistOrder(order);
    }
  }

  function gripHandlers(id: string) {
    return {
      onPointerDown: (event: ReactPointerEvent) => {
        if (event.pointerType !== "touch") return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointerId.current = event.pointerId;
        dragStartOrderRef.current = order;
        setDraggedId(id);
      },
      onPointerMove: (event: ReactPointerEvent) => {
        if (event.pointerId !== activePointerId.current || !draggedId) return;
        const point = document.elementFromPoint(event.clientX, event.clientY);
        const targetId = point?.closest("[data-module-id]")?.getAttribute("data-module-id");
        if (!targetId || targetId === draggedId) return;
        setOrder((current) => moveId(current, draggedId, targetId));
      },
      onPointerUp: endGripDrag,
      onPointerCancel: endGripDrag,
    };
  }

  return (
    <div
      onDragOver={(event) => {
        if (selectedCustomCount < MAX_CUSTOM_DASHBOARD_MODULES) event.preventDefault();
      }}
      onDrop={addCustomModule}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((id) => {
          const customModule = customModules.find((module) => module.id === id);
          const wrapperClass = `relative h-full ${draggedId === id ? "opacity-60" : ""}`;

          if (id === "documents") return (
            <div key={id} data-module-id={id} {...dragProps(id)} className={wrapperClass}>
              <ModuleCard icon={FileText} tone={{ className: "bg-blue-50" }} name="Documents" href="/documents" meta={`${documentCount} tracked`} detail={documentCount ? `${documentsExpiringSoon} expiring soon` : "Add documents to track"} gripHandlers={gripHandlers(id)} />
            </div>
          );
          if (id === "goals") return (
            <div key={id} data-module-id={id} {...dragProps(id)} className={wrapperClass}>
              <ModuleCard icon={Target} tone={{ className: "bg-violet-50" }} name="Goals" href="/goals" meta={`${goalCount} active goal${goalCount === 1 ? "" : "s"}`} detail={`${goalsAtRisk} on risk`} gripHandlers={gripHandlers(id)} />
            </div>
          );
          if (id === "finance") return <div key={id} data-module-id={id} {...dragProps(id)} className={wrapperClass}><FinanceModuleCard items={financeItems} gripHandlers={gripHandlers(id)} /></div>;
          if (id === "relationships") return <div key={id} data-module-id={id} {...dragProps(id)} className={wrapperClass}><RelationshipModuleCard people={relationshipPeople} upcomingDates={relationshipUpcomingDates} gripHandlers={gripHandlers(id)} /></div>;
          if (!customModule) return null;

          return (
            <div key={id} data-module-id={id} {...dragProps(id)} className={wrapperClass}>
              <ModuleCard
                icon={customModuleIcon(customModule.icon)}
                tone={{ color: customModule.color }}
                name={customModule.name}
                href={`/custom-modules/${id}`}
                meta={`${customModule.itemCount} ${customModule.name} ${customModule.itemCount === 1 ? "Item" : "Items"}`}
                onRemove={() => removeCustomModule(id)}
                gripHandlers={gripHandlers(id)}
              />
            </div>
          );
        })}
      </div>
      {/* Desktop: drag a custom module in from the sidebar, as before. */}
      {slotsLeft > 0 && (
        <div className="mt-3 hidden rounded-2xl border border-dashed border-zinc-100 px-4 py-2.5 text-center text-[11px] text-zinc-300 md:block">
          Drop a custom module here · {slotsLeft} slots available
        </div>
      )}
      {/*
        Phone (KD-045): HTML5 drag never fires from a touchscreen, and the
        sidebar's module links only live in a sheet that covers this grid, so
        adding is a tap here instead -- the same addCustomModuleById the drop
        uses, cap and all.
      */}
      {slotsLeft > 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 transition active:bg-zinc-50 md:hidden"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />Add a module
          <span className="font-normal text-zinc-400">· {slotsLeft} {slotsLeft === 1 ? "slot" : "slots"} available</span>
        </button>
      ) : (
        <p className="mt-3 text-center text-xs text-zinc-400 md:hidden">Dashboard full. Remove a module to add another.</p>
      )}
      <AddModuleSheet
        open={adding}
        onClose={() => setAdding(false)}
        modules={addableCustomModules(customModules, order)}
        onAdd={(id) => { addCustomModuleById(id); setAdding(false); }}
      />
      {saveFailed && !saving && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600">
          Couldn&apos;t save your dashboard layout. It&apos;ll look like this until you reload, but the change hasn&apos;t been kept — try again.
        </p>
      )}
    </div>
  );
}

/**
 * The phone's list of custom modules that can still go on the dashboard
 * (KD-045). With nothing to offer it says where modules are made rather than
 * showing an empty list.
 */
function AddModuleSheet({ open, onClose, modules, onAdd }: { open: boolean; onClose: () => void; modules: CustomModuleSummary[]; onAdd: (id: string) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Add a module">
      <h2 className="px-1 pb-3 text-base font-semibold text-zinc-950">Add a module</h2>
      {modules.length ? (
        <ul className="space-y-2">
          {modules.map((module) => {
            const Icon = customModuleIcon(module.icon);
            return (
              <li key={module.id}>
                <button
                  type="button"
                  onClick={() => onAdd(module.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3.5 py-3 text-left transition active:bg-zinc-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ color: module.color, backgroundColor: `color-mix(in srgb, ${module.color} 12%, white)` }}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900">{module.name}</span>
                    <span className="block text-xs text-zinc-500">{module.itemCount} {module.itemCount === 1 ? "item" : "items"}</span>
                  </span>
                  <Plus className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 pb-2 text-sm leading-6 text-zinc-500">
          Every custom module is already on your dashboard, or you haven&apos;t made one yet. Create one from <span className="font-semibold text-zinc-700">More → Add Module</span>.
        </p>
      )}
    </BottomSheet>
  );
}
