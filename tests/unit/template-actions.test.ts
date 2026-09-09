import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  cloneTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/data/templates", () => ({
  createTemplate: mocks.createTemplate,
  updateTemplate: mocks.updateTemplate,
  cloneTemplate: mocks.cloneTemplate,
  deleteTemplate: mocks.deleteTemplate,
}));

import { cloneTemplateAction, createTemplateAction, deleteTemplateAction, updateTemplateAction } from "@/app/(app)/settings/templates/actions";
import { ActionRefusal } from "@/lib/actions/refusal";
import { TEMPLATE_FIELDS_FORM_KEY } from "@/lib/templates/parse";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const withFields = (values: Record<string, string>, fields: Array<Record<string, unknown>>) =>
  form({ ...values, [TEMPLATE_FIELDS_FORM_KEY]: JSON.stringify(fields) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` }); });
});

describe("createTemplateAction", () => {
  it("creates a blank template and redirects straight into its detail screen", async () => {
    mocks.createTemplate.mockResolvedValue({ id: "template-1" });
    await expect(createTemplateAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings/templates/template-1");
  });
});

describe("updateTemplateAction", () => {
  it("refuses a blank name without calling the data layer", async () => {
    await expect(updateTemplateAction("template-1", {}, withFields({ name: "  " }, [])))
      .resolves.toEqual({ error: "Enter a template name." });
    expect(mocks.updateTemplate).not.toHaveBeenCalled();
  });

  it("reports a payload it can't parse instead of throwing", async () => {
    const data = form({ name: "Decision" });
    data.set(TEMPLATE_FIELDS_FORM_KEY, "{not json");
    const result = await updateTemplateAction("template-1", {}, data);
    expect(result.error).toBeTruthy();
    expect(mocks.updateTemplate).not.toHaveBeenCalled();
  });

  it("passes the parsed name and fields through to the data layer", async () => {
    mocks.updateTemplate.mockResolvedValue(undefined);
    await expect(updateTemplateAction("template-1", {}, withFields(
      { name: "Decision" },
      [{ id: "field-1", label: "Date", type: "DATE" }],
    ))).resolves.toEqual({ saved: true });
    expect(mocks.updateTemplate).toHaveBeenCalledWith("template-1", "Decision", [{ id: "field-1", label: "Date", type: "DATE" }]);
  });

  /**
   * A refusal raised by the data layer (the template is locked, or no longer
   * exists) comes back as a message the form can render -- not a thrown
   * error Next.js would redact before it reached the owner.
   */
  it("turns a data-layer refusal into a message instead of throwing", async () => {
    mocks.updateTemplate.mockRejectedValue(new ActionRefusal("This template is in use, so its fields can no longer be retyped or removed."));
    await expect(updateTemplateAction("template-1", {}, withFields({ name: "Decision" }, [])))
      .resolves.toEqual({ error: "This template is in use, so its fields can no longer be retyped or removed." });
  });

  it("rethrows a fault rather than dressing it up as a refusal", async () => {
    mocks.updateTemplate.mockRejectedValue(new Error("connection reset"));
    await expect(updateTemplateAction("template-1", {}, withFields({ name: "Decision" }, [])))
      .rejects.toThrow("connection reset");
  });
});

describe("cloneTemplateAction", () => {
  it("refuses a blank name without calling the data layer", async () => {
    await expect(cloneTemplateAction("template-1", {}, form({ name: "" })))
      .resolves.toEqual({ error: "Enter a name for the copy." });
    expect(mocks.cloneTemplate).not.toHaveBeenCalled();
  });

  it("clones and redirects into the new template's detail screen", async () => {
    mocks.cloneTemplate.mockResolvedValue({ id: "template-2" });
    await expect(cloneTemplateAction("template-1", {}, form({ name: "Copy of Decision" })))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.cloneTemplate).toHaveBeenCalledWith("template-1", "Copy of Decision");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings/templates/template-2");
  });
});

describe("deleteTemplateAction", () => {
  it("deletes and redirects back to the list", async () => {
    mocks.deleteTemplate.mockResolvedValue(undefined);
    await expect(deleteTemplateAction("template-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings/templates");
  });

  it("reports a refusal instead of redirecting when the template is in use", async () => {
    mocks.deleteTemplate.mockRejectedValue(new ActionRefusal("This template is in use and cannot be deleted."));
    await expect(deleteTemplateAction("template-1")).resolves.toEqual({ error: "This template is in use and cannot be deleted." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
