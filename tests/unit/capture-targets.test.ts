import { describe, expect, it } from "vitest";
import {
  CAPTURE_SOURCE_PARAM,
  CAPTURE_TITLE_PARAM,
  captureCreateHref,
  captureTarget,
  captureTargetCarries,
  captureTargets,
  DEFAULT_CAPTURE_TARGET,
  isCaptureTargetType,
  splitCaptureDetails,
} from "@/lib/capture/targets";
import { readCaptureParams } from "@/lib/capture/params";

/**
 * KD-008's requirement is that the fields a capture offers follow what it is
 * about to become, so a value the target cannot hold is never silently lost.
 * These cover that rule rather than the specific targets registered today.
 */

describe("capture targets: what a capture can become", () => {
  it("creates a To-Do by default, so pressing Enter never has to pick a module", () => {
    expect(DEFAULT_CAPTURE_TARGET).toBe("TODO");
    expect(captureTarget("TODO").createdInPlace).toBe(true);
  });

  it("offers the To-Do first, ahead of the targets that need a module detour", () => {
    expect(captureTargets[0].type).toBe(DEFAULT_CAPTURE_TARGET);
  });

  it("rejects a target that is not registered rather than trusting the form value", () => {
    expect(isCaptureTargetType("TODO")).toBe(true);
    expect(isCaptureTargetType("PERSON")).toBe(false);
    expect(isCaptureTargetType(undefined)).toBe(false);
  });

  it("only offers a due date where the target actually has one", () => {
    expect(captureTargetCarries("TODO", "dueDate")).toBe(true);
    expect(captureTargetCarries("GOAL", "dueDate")).toBe(true);
    // A document's expiry is a fact about the document, not an action's deadline.
    expect(captureTargetCarries("DOCUMENT", "dueDate")).toBe(false);
  });

  it("only offers a status where the target has the To-Do's own vocabulary", () => {
    expect(captureTargetCarries("TODO", "status")).toBe(true);
    expect(captureTargetCarries("GOAL", "status")).toBe(false);
    expect(captureTargetCarries("DOCUMENT", "status")).toBe(false);
  });
});

describe("splitCaptureDetails: naming what a change of target would lose", () => {
  const details = { status: "WAITING", dueDate: "2026-10-01", link: "object-id" };

  it("carries everything when the capture stays a To-Do", () => {
    expect(splitCaptureDetails("TODO", details)).toEqual({ carried: ["status", "dueDate", "link"], dropped: [] });
  });

  it("names the details a document cannot hold instead of dropping them quietly", () => {
    expect(splitCaptureDetails("DOCUMENT", details)).toEqual({ carried: ["link"], dropped: ["status", "dueDate"] });
  });

  it("counts a detail the user never filled in as nothing to lose", () => {
    expect(splitCaptureDetails("DOCUMENT", { status: "", dueDate: "", link: "" }).dropped).toEqual([]);
    expect(splitCaptureDetails("DOCUMENT", { dueDate: undefined }).dropped).toEqual([]);
    expect(splitCaptureDetails("DOCUMENT", { dueDate: null }).dropped).toEqual([]);
  });
});

describe("captureCreateHref: handing a capture to the module that owns it", () => {
  it("has no destination for a target quick capture creates itself", () => {
    expect(captureCreateHref("TODO", "Renew passport")).toBeNull();
  });

  it("prefills the title so the user does not retype what they just typed", () => {
    const href = captureCreateHref("DOCUMENT", "Passport Somalia");
    expect(href).toBe(`/documents?${CAPTURE_TITLE_PARAM}=Passport+Somalia`);
  });

  it("escapes a title rather than letting it change the query string", () => {
    const href = captureCreateHref("GOAL", "Save $10k & move")!;
    expect(new URL(href, "https://kinesis.test").searchParams.get(CAPTURE_TITLE_PARAM)).toBe("Save $10k & move");
  });

  it("names the To-Do a conversion came from, so it can retire once the record exists", () => {
    const href = captureCreateHref("DOCUMENT", "Passport", { from: "todo-1" })!;
    expect(new URL(href, "https://kinesis.test").searchParams.get(CAPTURE_SOURCE_PARAM)).toBe("todo-1");
  });

  it("passes a due date to a goal, which has a target date to put it in", () => {
    const href = captureCreateHref("GOAL", "Save $10k", { dueDate: "2026-12-01" })!;
    expect(new URL(href, "https://kinesis.test").searchParams.get("due")).toBe("2026-12-01");
  });

  it("does not pass a due date to a document, which has nowhere to put it", () => {
    const href = captureCreateHref("DOCUMENT", "Passport", { dueDate: "2026-12-01" })!;
    expect(new URL(href, "https://kinesis.test").searchParams.get("due")).toBeNull();
  });
});

describe("readCaptureParams: what a module's create surface makes of the URL", () => {
  it("returns nothing when the page was not opened by a capture", () => {
    expect(readCaptureParams({})).toBeUndefined();
    expect(readCaptureParams({ filter: "at-risk" })).toBeUndefined();
    expect(readCaptureParams({ capture: "   " })).toBeUndefined();
  });

  it("reads the title, source and due date a conversion carries", () => {
    expect(readCaptureParams({ capture: "Renew passport", from: "todo-1", due: "2026-12-01" }))
      .toEqual({ title: "Renew passport", from: "todo-1", dueDate: "2026-12-01" });
  });

  it("takes the first value when a parameter is repeated, rather than failing", () => {
    expect(readCaptureParams({ capture: ["First", "Second"] })).toEqual({ title: "First" });
  });

  it("omits a source and due date that were not supplied", () => {
    expect(readCaptureParams({ capture: "Renew passport" })).toEqual({ title: "Renew passport" });
  });
});
