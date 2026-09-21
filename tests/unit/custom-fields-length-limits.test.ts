import { describe, expect, it } from "vitest";
import { parseCustomFields } from "@/lib/custom-fields/parse";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";
import { LINK_LIMIT, NUMBER_MAGNITUDE_LIMIT, TEXT_LIMIT } from "@/lib/validation/field-limits";

/**
 * KD-043 -- an ad-hoc custom field (Documents/Goals/Custom Items' own extra
 * fields) has no "Notes" (multiline) variant the way a TemplateField can, so
 * every TEXT value gets the single-line tier regardless of how it's saved.
 */

const form = (fields: unknown[]) => {
  const data = new FormData();
  data.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify(fields));
  return data;
};

describe("parseCustomFields: length/range limits by kind", () => {
  it("accepts a TEXT value at exactly the text limit", () => {
    const result = parseCustomFields(form([{ label: "Note", type: "TEXT", value: "a".repeat(TEXT_LIMIT) }]));
    expect(result.ok).toBe(true);
  });

  it("refuses a TEXT value one character over the text limit", () => {
    const result = parseCustomFields(form([{ label: "Note", type: "TEXT", value: "a".repeat(TEXT_LIMIT + 1) }]));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Note") });
  });

  it("refuses a LINK value over the link limit", () => {
    const result = parseCustomFields(form([{ label: "Website", type: "LINK", value: "https://example.com/" + "a".repeat(LINK_LIMIT) }]));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Website") });
  });

  it("refuses a NUMBER value over the magnitude ceiling", () => {
    const result = parseCustomFields(form([{ label: "Total", type: "NUMBER", value: String(NUMBER_MAGNITUDE_LIMIT + 1) }]));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Total") });
  });

  it("does not check magnitude on a NUMBER value that isn't actually numeric -- a separate, pre-existing gap", () => {
    const result = parseCustomFields(form([{ label: "Total", type: "NUMBER", value: "not-a-number" }]));
    expect(result.ok).toBe(true);
  });

  it("never limits DATE, CHECKBOX, or KINESIS_LINK -- they aren't free text", () => {
    const result = parseCustomFields(form([
      { label: "When", type: "DATE", value: "2026-01-01" },
      { label: "Done", type: "CHECKBOX", value: "true" },
      { label: "Related", type: "KINESIS_LINK", targetObjectIds: ["obj-1"] },
    ]));
    expect(result.ok).toBe(true);
  });
});
