"use client";

import Link from "next/link";
import { FileText, GripVertical, Landmark, Target, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { useFinanceItems } from "@/lib/useFinanceItems";

const STORAGE_KEY = "kinesis-module-shortcuts";
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
  goalCount: number;
  customModules: CustomModuleSummary[];
};

function readRelationshipCount() {
  try {
    const value = localStorage.getItem("kinesis-relationship-map");
    if (value) {
      const people = JSON.parse(value);
      if (Array.isArray(people)) return people.length;
    }
  } catch {
    // Keep the dashboard's existing useful fallback if local data is malformed.
  }
  return 6;
}

export function ModuleShortcuts({ documentCount, goalCount, customModules }: ModuleShortcutsProps) {
  const financeItems = useFinanceItems();
  const [relationshipCount, setRelationshipCount] = useState(6);
  const [order, setOrder] = useState<string[]>([
    ...SYSTEM_IDS,
    ...customModules.slice(0, MAX_CUSTOM_MODULES).map(({ id }) => id),
  ]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [moduleToAdd, setModuleToAdd] = useState("");

  const customIds = useMemo(() => new Set(customModules.map(({ id }) => id)), [customModules]);
  const selectedCustomCount = order.filter((id) => customIds.has(id)).length;
  const availableModules = customModules.filter(({ id }) => !order.includes(id));

  useEffect(() => {
    const refreshRelationships = () => setRelationshipCount(readRelationshipCount());
    window.addEventListener("storage", refreshRelationships);
    window.addEventListener("kinesis-relationships-updated", refreshRelationships);

    const hydrate = setTimeout(() => {
      refreshRelationships();
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const saved = JSON.parse(stored);
          if (Array.isArray(saved)) {
            const seen = new Set<string>();
            const valid = saved.filter((id): id is string => {
              if (typeof id !== "string" || seen.has(id)) return false;
              const isAvailable = SYSTEM_IDS.includes(id as (typeof SYSTEM_IDS)[number]) || customIds.has(id);
              if (isAvailable) seen.add(id);
              return isAvailable;
            });
            let customCount = 0;
            const completeOrder = valid.filter((id) => {
              if (!customIds.has(id)) return true;
              customCount += 1;
              return customCount <= MAX_CUSTOM_MODULES;
            });
            for (const systemId of SYSTEM_IDS) {
              if (!completeOrder.includes(systemId)) completeOrder.push(systemId);
            }
            setOrder(completeOrder);
          }
        } catch {
          // Ignore malformed preferences and use the default order.
        }
      }
    }, 0);

    return () => {
      clearTimeout(hydrate);
      window.removeEventListener("storage", refreshRelationships);
      window.removeEventListener("kinesis-relationships-updated", refreshRelationships);
    };
  }, [customIds]);

  function saveOrder(nextOrder: string[]) {
    setOrder(nextOrder);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOrder));
  }

  function moveModule(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const nextOrder = order.filter((id) => id !== draggedId);
    nextOrder.splice(nextOrder.indexOf(targetId), 0, draggedId);
    saveOrder(nextOrder);
  }

  function addModule() {
    if (!moduleToAdd || selectedCustomCount >= MAX_CUSTOM_MODULES) return;
    saveOrder([...order, moduleToAdd]);
    setModuleToAdd("");
  }

  function removeModule(id: string) {
    saveOrder(order.filter((moduleId) => moduleId !== id));
  }

  const systemModules = {
    documents: { name: "Documents", href: "/documents", count: documentCount, icon: FileText, tone: "bg-blue-50" },
    goals: { name: "Goal", href: "/goals", count: goalCount, icon: Target, tone: "bg-violet-50" },
    finance: { name: "Finance", href: "/finance", count: financeItems.length, icon: Landmark, tone: "bg-emerald-50" },
    relationships: { name: "Relationship", href: "/relationships", count: relationshipCount, icon: Users, tone: "bg-sky-50" },
  };

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-500">Drag modules to reorder your shortcuts. The four system modules always stay available.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((id) => {
          const systemModule = systemModules[id as keyof typeof systemModules];
          const customModule = customModules.find((module) => module.id === id);
          if (!systemModule && !customModule) return null;
          const name = systemModule?.name ?? customModule!.name;
          const count = systemModule?.count ?? customModule!.itemCount;
          const href = systemModule?.href ?? `/custom-modules/${id}`;
          const Icon = systemModule?.icon;

          return (
            <div
              key={id}
              draggable
              onDragStart={() => setDraggedId(id)}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveModule(id)}
              className={`group relative rounded-2xl border bg-white p-4 shadow-sm transition ${draggedId === id ? "border-zinc-400 opacity-60" : "border-zinc-200/80 hover:-translate-y-0.5 hover:shadow-md"}`}
            >
              <div className="flex items-start justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-700 ${systemModule?.tone ?? ""}`} style={customModule ? { backgroundColor: `color-mix(in srgb, ${customModule.color} 10%, white)` } : undefined}>
                  {Icon ? <Icon className="h-[18px] w-[18px]" /> : <CustomModuleIcon name={customModule!.icon} className="h-[18px] w-[18px]" />}
                </span>
                <div className="flex items-center gap-1">
                  <GripVertical className="h-5 w-5 cursor-grab text-zinc-300" aria-label={`Drag ${name}`} />
                  {customModule && (
                    <button type="button" onClick={() => removeModule(id)} aria-label={`Remove ${name} shortcut`} className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <Link href={href} className="mt-4 block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
                <p className="font-semibold text-zinc-900">{name}</p>
                <p className="mt-1 text-sm text-zinc-500">{count} {name} {count === 1 ? "Item" : "Items"}</p>
              </Link>
            </div>
          );
        })}
      </div>

      {availableModules.length > 0 && selectedCustomCount < MAX_CUSTOM_MODULES && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="module-shortcut" className="text-sm font-medium text-zinc-600">Add a custom module</label>
          <select id="module-shortcut" value={moduleToAdd} onChange={(event) => setModuleToAdd(event.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400">
            <option value="">Choose a module</option>
            {availableModules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
          </select>
          <button type="button" onClick={addModule} disabled={!moduleToAdd} className="h-10 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">Add shortcut</button>
          <span className="text-xs text-zinc-400">{selectedCustomCount} of {MAX_CUSTOM_MODULES} custom slots used</span>
        </div>
      )}
    </div>
  );
}
