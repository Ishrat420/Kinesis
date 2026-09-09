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
    expect(result).toEqual({ ok: true, fields: [{ id: "field-1", label: "Date", type: "DATE" }] });
  });

  it("omits the id for a field that has none yet", () => {
    const result = parseTemplateFields(withPayload([{ label: "Notes", type: "TEXT" }]));
    expect(result).toEqual({ ok: true, fields: [{ id: undefined, label: "Notes", type: "TEXT" }] });
  });

  it("drops a field with a blank label", () => {
    const result = parseTemplateFields(withPayload([{ label: "  ", type: "TEXT" }, { label: "Kept", type: "TEXT" }]));
    expect(result).toEqual({ ok: true, fields: [{ id: undefined, label: "Kept", type: "TEXT" }] });
  });

  it("falls back to TEXT for an unrecognised type", () => {
    const result = parseTemplateFields(withPayload([{ label: "Mystery", type: "NOT_A_TYPE" }]));
    expect(result).toEqual({ ok: true, fields: [{ id: undefined, label: "Mystery", type: "TEXT" }] });
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
});
