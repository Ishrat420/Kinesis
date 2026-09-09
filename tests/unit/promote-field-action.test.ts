import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  promoteExtraFieldToTemplate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/data/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/data/custom-modules", () => ({ promoteExtraFieldToTemplate: mocks.promoteExtraFieldToTemplate }));

import { promoteFieldToTemplateAction } from "@/app/(app)/custom-modules/actions";
import { ActionRefusal } from "@/lib/actions/refusal";

describe("promoteFieldToTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
  });

  it("reports success once the field is promoted", async () => {
    mocks.promoteExtraFieldToTemplate.mockResolvedValue(undefined);
    await expect(promoteFieldToTemplateAction("module-1", "item-1", "field-1")).resolves.toEqual({ saved: true });
    expect(mocks.promoteExtraFieldToTemplate).toHaveBeenCalledWith("module-1", "item-1", "field-1");
  });

  /** An item that doesn't follow a template, or a stray field id, comes back as a message rather than a crash. */
  it("turns a refusal into a message instead of throwing", async () => {
    mocks.promoteExtraFieldToTemplate.mockRejectedValue(new ActionRefusal("This item doesn't follow a template."));
    await expect(promoteFieldToTemplateAction("module-1", "item-1", "field-1")).resolves.toEqual({ error: "This item doesn't follow a template." });
  });

  it("rethrows a fault rather than dressing it up as a refusal", async () => {
    mocks.promoteExtraFieldToTemplate.mockRejectedValue(new Error("connection reset"));
    await expect(promoteFieldToTemplateAction("module-1", "item-1", "field-1")).rejects.toThrow("connection reset");
  });
});
