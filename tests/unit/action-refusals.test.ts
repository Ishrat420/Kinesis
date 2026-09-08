import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  resolveDocumentType: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  validateKinesisTargets: vi.fn(),
  addActivity: vi.fn(),
  completeCaptureConversion: vi.fn(),
  updateTodoDetails: vi.fn(),
  prisma: {
    customModule: { findFirst: vi.fn() },
    customItem: { create: vi.fn(), findFirst: vi.fn() },
    milestone: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/data/activity", () => ({ addActivity: mocks.addActivity }));
vi.mock("@/lib/data/capture", () => ({ completeCaptureConversion: mocks.completeCaptureConversion }));
vi.mock("@/lib/data/kinesis-links", () => ({ validateKinesisTargets: mocks.validateKinesisTargets }));
vi.mock("@/lib/data/documents", () => ({
  resolveDocumentType: mocks.resolveDocumentType,
  createDocument: mocks.createDocument,
  updateDocument: mocks.updateDocument,
  deleteUnusedDocumentType: vi.fn(),
}));
vi.mock("@/lib/data/todos", () => ({
  updateTodoDetails: mocks.updateTodoDetails,
  captureTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getTodoLinkOptions: vi.fn(),
}));

import { createDocumentAction, updateDocumentAction } from "@/app/(app)/documents/actions";
import { createCustomItemAction, deleteCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { setTodoStatusAction } from "@/app/(app)/todos/actions";
import { toggleMilestoneAction } from "@/app/(app)/goals/actions";
import { ActionRefusal, refusalOf } from "@/lib/actions/refusal";

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  return data;
};

/** A form carrying the given custom fields, JSON-encoded under the one key `parseCustomFields` reads (KD-034). */
const withCustomFields = (values: Record<string, string>, fields: Array<Record<string, unknown>>) =>
  form({ ...values, customFieldsPayload: JSON.stringify(fields) });

/** A document form carrying one Kinesis Link field with nothing chosen in it. */
const emptyLinkDocument = () => withCustomFields(
  { name: "Passport", type: "Identity" },
  [{ label: "Related goal", type: "KINESIS_LINK", value: "", targetObjectIds: [] }],
);

describe("refusalOf", () => {
  it("reports the message of a refusal", () => {
    expect(refusalOf(new ActionRefusal("Say this to the owner."))).toBe("Say this to the owner.");
  });

  /**
   * Anything else is a fault, or one of the control-flow errors `redirect()` and
   * `notFound()` throw. Reporting null is what makes every caller rethrow rather
   * than swallow a navigation.
   */
  it.each([
    ["an ordinary fault", new Error("connection reset")],
    ["a Next.js control-flow error", Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/goals;307;" })],
  ])("does not claim %s as a refusal", (_label, error) => {
    expect(refusalOf(error)).toBeNull();
  });
});

describe("validation the owner can read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.resolveDocumentType.mockImplementation(async (value: string) => value);
    mocks.validateKinesisTargets.mockResolvedValue(null);
  });

  /**
   * The headline case. This message was written for the owner but thrown, and
   * Next.js redacts a thrown message before it reaches the browser -- so what
   * they actually got was "An unexpected error occurred", a digest hash, and a
   * crash screen in place of the form they had just filled in.
   */
  it("names the unfilled Kinesis Link field instead of throwing, on create", async () => {
    await expect(createDocumentAction({}, emptyLinkDocument()))
      .resolves.toEqual({ error: "Choose what “Related goal” links to." });
    expect(mocks.createDocument).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("names the unfilled Kinesis Link field instead of throwing, on update", async () => {
    await expect(updateDocumentAction("document-id", {}, emptyLinkDocument()))
      .resolves.toEqual({ error: "Choose what “Related goal” links to." });
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it("does the same for a custom item's fields", async () => {
    await expect(createCustomItemAction("module-id", {}, withCustomFields(
      { name: "Service" },
      [{ label: "Related document", type: "KINESIS_LINK", value: "", targetObjectIds: [] }],
    ))).resolves.toEqual({ error: "Choose what “Related document” links to." });
    expect(mocks.prisma.customItem.create).not.toHaveBeenCalled();
  });

  /**
   * Also the guard on the redaction fix: `redirect()` navigates by throwing, so
   * it is left outside every `try` these actions grew. Catching it would turn a
   * successful save into a swallowed exception and strand the owner on the form.
   */
  it("passes a chosen link target through and lets the redirect fly", async () => {
    mocks.createDocument.mockResolvedValue({ id: "new-document", name: "Passport" });
    mocks.redirect.mockImplementation(() => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/documents/new-document;307;" }); });

    await expect(createDocumentAction({}, withCustomFields(
      { name: "Passport", type: "Identity" },
      [{ label: "Related goal", type: "KINESIS_LINK", value: "", targetObjectIds: ["goal-object-id"] }],
    ))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.createDocument).toHaveBeenCalledWith(expect.objectContaining({
      customFields: [expect.objectContaining({ label: "Related goal", type: "KINESIS_LINK", targetObjectIds: ["goal-object-id"] })],
    }));
    expect(mocks.redirect).toHaveBeenCalledWith("/documents/new-document");
  });

  it("reports a link whose target is no longer the owner's", async () => {
    mocks.validateKinesisTargets.mockResolvedValue("One of the linked items no longer exists. Reopen the link field and choose again.");
    await expect(createDocumentAction({}, withCustomFields(
      { name: "Passport", type: "Identity" },
      [{ label: "Related goal", type: "KINESIS_LINK", value: "", targetObjectIds: ["someone-elses-object"] }],
    ))).resolves.toEqual({ error: "One of the linked items no longer exists. Reopen the link field and choose again." });
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });
});

describe("row actions report their outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
  });

  it("refuses a status a to-do cannot have", async () => {
    await expect(setTodoStatusAction("todo-id", "NOPE")).resolves.toEqual({ error: "That is not a status a to-do can have." });
    expect(mocks.updateTodoDetails).not.toHaveBeenCalled();
  });

  it("turns a refusal raised inside the to-do transaction into a message", async () => {
    mocks.updateTodoDetails.mockRejectedValue(new ActionRefusal("This to-do no longer exists."));
    await expect(setTodoStatusAction("todo-id", "DONE")).resolves.toEqual({ error: "This to-do no longer exists." });
  });

  /** A fault is not the form's to explain -- it belongs to the error boundary. */
  it("rethrows a fault rather than dressing it up as a refusal", async () => {
    mocks.updateTodoDetails.mockRejectedValue(new Error("connection reset"));
    await expect(setTodoStatusAction("todo-id", "DONE")).rejects.toThrow("connection reset");
  });

  it("says so when an item delete finds nothing to delete, without navigating", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue(null);
    await expect(deleteCustomItemAction("module-id", "item-id")).resolves.toEqual({ error: "This item no longer exists." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("says so when a milestone toggle finds nothing to toggle", async () => {
    mocks.prisma.milestone.findFirst.mockResolvedValue(null);
    await expect(toggleMilestoneAction("goal-id", "milestone-id", true)).resolves.toEqual({ error: "This milestone no longer exists." });
    expect(mocks.prisma.milestone.update).not.toHaveBeenCalled();
  });
});
