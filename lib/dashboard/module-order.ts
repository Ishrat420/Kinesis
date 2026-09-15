export const DASHBOARD_SYSTEM_MODULE_IDS = ["documents", "goals", "finance", "relationships"] as const;
export const MAX_CUSTOM_DASHBOARD_MODULES = 2;

const isSystemModuleId = (id: string): id is (typeof DASHBOARD_SYSTEM_MODULE_IDS)[number] =>
  (DASHBOARD_SYSTEM_MODULE_IDS as readonly string[]).includes(id);

/**
 * Reconciles a dashboard module order against what's actually still true,
 * used on both ends of the same value: restoring what the owner saved (a
 * custom module in it could have been deleted since) and validating what a
 * client submits to save (so a stale or tampered payload can't smuggle in
 * more custom slots than the UI allows, or a duplicate).
 *
 * Every system module id ends up present exactly once -- there is no way to
 * remove one from the grid, only reorder it -- in whatever relative order
 * survives, followed by any system ids missing from the input entirely.
 * Custom module ids are kept only while they still exist and the running
 * count hasn't passed MAX_CUSTOM_DASHBOARD_MODULES.
 */
export function resolveDashboardOrder(order: string[], existingCustomModuleIds: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  let customCount = 0;
  const kept = order.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    if (isSystemModuleId(id)) return true;
    if (!existingCustomModuleIds.has(id)) return false;
    customCount += 1;
    return customCount <= MAX_CUSTOM_DASHBOARD_MODULES;
  });
  for (const id of DASHBOARD_SYSTEM_MODULE_IDS) if (!kept.includes(id)) kept.push(id);
  return kept;
}

/**
 * Moves `draggedId` to just before `targetId`, used by both the Module
 * Shortcuts grid's mouse drag-and-drop (native HTML5 DnD) and its touch
 * drag (pointer events, which never fire an HTML5 dragstart on a phone).
 * Pulled out on its own so the two call sites can't drift, and so the swap
 * itself is testable without simulating either input method.
 */
export function moveId(order: readonly string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return [...order];
  const next = order.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex === -1) return [...order];
  next.splice(targetIndex, 0, draggedId);
  return next;
}
