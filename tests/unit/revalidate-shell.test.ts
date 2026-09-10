import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { revalidateShell } from "@/lib/actions/revalidate";

/**
 * The notification bell and sidebar are rendered by app/(app)/layout.tsx, not
 * by any one module's page -- revalidatePath("/") alone leaves that layout
 * cached, which is how a custom item's due date could go stale in the bell
 * while a To-Do's stayed fresh: two modules that looked like they meant the
 * same thing were calling revalidatePath with different arguments. Every
 * module now goes through this one helper instead of hand-writing the call,
 * so getting it right doesn't depend on remembering the second argument.
 */
describe("revalidateShell", () => {
  it("revalidates the root layout, not just the root page", () => {
    revalidateShell();
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });
});
