import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { updateDashboardModuleOrderAction } from "@/app/(app)/settings/actions";
import { getSettings } from "@/lib/data/settings";

/**
 * The dashboard's Module Shortcuts grid held its order in plain client
 * state with nothing behind it, so a drag, an add, or a remove silently
 * reverted on the next reload -- the whole point of the feature (KD-005)
 * undone by every refresh. This runs the save action against a real
 * database because what matters is exactly what's stored, and that a
 * submission naming someone else's (or a deleted) custom module can't
 * corrupt it.
 */

const owner = "dashboard-order-owner";
const otherOwner = "dashboard-order-other-owner";

async function makeCustomModule(id: string, userId: string) {
  await prisma.customModule.create({ data: { id, userId, name: id, normalizedName: id, icon: "package", color: "#111111" } });
}

describe.sequential("updateDashboardModuleOrderAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: [owner, otherOwner] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Order", lastName: "Owner", email: "dashboard-order-owner@example.test" },
        { id: otherOwner, firstName: "Order", lastName: "Other", email: "dashboard-order-other@example.test" },
      ],
    });
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
  });

  it("persists a reordering of the system modules", async () => {
    await expect(updateDashboardModuleOrderAction(["finance", "documents", "relationships", "goals"])).resolves.toEqual({});
    const settings = await getSettings();
    expect(settings.dashboardModuleOrder).toEqual(["finance", "documents", "relationships", "goals"]);
  });

  it("persists a custom module dropped into the grid", async () => {
    await makeCustomModule("module-owned", owner);
    await updateDashboardModuleOrderAction(["documents", "module-owned", "goals", "finance", "relationships"]);
    const settings = await getSettings();
    expect(settings.dashboardModuleOrder).toContain("module-owned");
  });

  it("drops a custom module id that isn't the current user's before storing", async () => {
    await makeCustomModule("module-someone-elses", otherOwner);
    await updateDashboardModuleOrderAction(["documents", "module-someone-elses", "goals", "finance", "relationships"]);
    const settings = await getSettings();
    expect(settings.dashboardModuleOrder).not.toContain("module-someone-elses");
  });

  it("drops a custom module id that doesn't exist at all before storing", async () => {
    await updateDashboardModuleOrderAction(["documents", "never-existed", "goals", "finance", "relationships"]);
    const settings = await getSettings();
    expect(settings.dashboardModuleOrder).not.toContain("never-existed");
  });

  it("caps custom module ids at the maximum the grid allows", async () => {
    await makeCustomModule("module-a", owner);
    await makeCustomModule("module-b", owner);
    await makeCustomModule("module-c", owner);
    await updateDashboardModuleOrderAction(["documents", "module-a", "module-b", "module-c", "goals", "finance", "relationships"]);
    const settings = await getSettings();
    expect(settings.dashboardModuleOrder.filter((id) => id.startsWith("module-"))).toEqual(["module-a", "module-b"]);
  });

  it("does not touch another user's dashboard order", async () => {
    mocks.requireKinesisUser.mockResolvedValue({ id: otherOwner });
    await updateDashboardModuleOrderAction(["finance", "documents", "relationships", "goals"]);

    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    const settings = await getSettings();
    expect(settings.dashboardModuleOrder).toEqual([]);
  });
});
