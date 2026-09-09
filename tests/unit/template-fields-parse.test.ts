import { describe, expect, it } from "vitest";
import { parseTemplateFields, TEMPLATE_FIELDS_FORM_KEY } from "@/lib/templates/parse";

const withPayload = (fields: unknown) => {
  const data = new FormData();
  data.set(TEMPLATE_FIELDS_FORM_KEY, JSON.stringify(fields));
  return data;
};

describe("parseTemplateFields", () => {
  it("returns an empty list when the form carries no payload", () => {
    expect(parseTemplateFields(new FormData())).toEqual({ ok: true, fields: [] });
  });

  it("reads label, type, and a stable id when present", () => {
    const result = parseTemplateFields(withPayload([{ id: "field-1", label: "Date", type: "DATE" }]));
    expect(result).toEqual({ ok: true, fields: [{ id: "field-1", label: "Date", type: "DATE", isDueDate: false }] });
  });

  it("omits the id for a field that has none yet", () => {
    const result = parseTemplateFields(withPayload([{ label: "Notes", type: "TEXT" }]));
    expect(result).toEqual({ ok: true, fields: [{ id: undefined, label: "Notes", type: "TEXT", isDueDate: false }] });
  });

  it("drops a field with a blank label", () => {
    const result = parseTemplateFields(withPayload([{ label: "  ", type: "TEXT" }, { label: "Kept", type: "TEXT" }]));
    expect(result).toEqual({ ok: true, fields: [{ id: undefined, label: "Kept", type: "TEXT", isDueDate: false }] });
  });

  it("falls back to TEXT for an unrecognised type", () => {
    const result = parseTemplateFields(withPayload([{ label: "Mystery", type: "NOT_A_TYPE" }]));
    expect(result).toEqual({ ok: true, fields: [{ id: undefined, label: "Mystery", type: "TEXT", isDueDate: false }] });
  });

  it("reports an error for a payload that isn't JSON", () => {
    const data = new FormData();
    data.set(TEMPLATE_FIELDS_FORM_KEY, "{not json");
    const result = parseTemplateFields(data);
    expect(result.ok).toBe(false);
  });

  it("reports an error for a JSON payload that isn't an array", () => {
    const data = new FormData();
    data.set(TEMPLATE_FIELDS_FORM_KEY, JSON.stringify({ not: "an array" }));
    const result = parseTemplateFields(data);
    expect(result.ok).toBe(false);
  });

  /** KD-038: never trust the client's claimed type for a due-date field -- it's always DATE. */
  it("forces a due-date field's type to DATE regardless of what's submitted", () => {
    const result = parseTemplateFields(withPayload([{ label: "Renewal", type: "TEXT", isDueDate: true }]));
    expect(result).toEqual({ ok: true, fields: [{ id: undefined, label: "Renewal", type: "DATE", isDueDate: true }] });
  });

  it("reads isDueDate as false when absent", () => {
    const result = parseTemplateFields(withPayload([{ label: "Date", type: "DATE" }]));
    expect(result.ok && result.fields[0].isDueDate).toBe(false);
  });
});
