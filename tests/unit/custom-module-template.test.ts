import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    customModule: { create: vi.fn() },
    template: { findFirst: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));

import { createCustomModuleAction } from "@/app/(app)/custom-modules/actions";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const baseFields = { name: "Skincare", icon: "package", color: "#7c3aed" };

describe("createCustomModuleAction template linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
  });

  it("creates a blank module when no template is chosen", async () => {
    mocks.prisma.customModule.create.mockResolvedValue({ id: "module-1" });
    await createCustomModuleAction({}, form(baseFields));
    expect(mocks.prisma.template.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.customModule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ templateId: null }) }));
  });

  it("links the module to a template the owner actually has", async () => {
    mocks.prisma.template.findFirst.mockResolvedValue({ id: "template-1" });
    mocks.prisma.customModule.create.mockResolvedValue({ id: "module-1" });
    await createCustomModuleAction({}, form({ ...baseFields, templateId: "template-1" }));
    expect(mocks.prisma.template.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "template-1", userId: "owner-id" } }));
    expect(mocks.prisma.customModule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ templateId: "template-1" }) }));
  });

  /** A stray or someone else's template id in the submitted form must fail closed. */
  it("refuses a template id the owner doesn't have, without creating the module", async () => {
    mocks.prisma.template.findFirst.mockResolvedValue(null);
    const result = await createCustomModuleAction({}, form({ ...baseFields, templateId: "someone-elses-template" }));
    expect(result).toEqual({ error: "Choose a template you own, or leave it blank." });
    expect(mocks.prisma.customModule.create).not.toHaveBeenCalled();
  });
});
