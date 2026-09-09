import { describe, expect, it } from "vitest";
import { parseTemplateFieldValues, TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";

const withPayload = (values: unknown) => {
  const data = new FormData();
  data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify(values));
  return data;
};

describe("parseTemplateFieldValues", () => {
  it("returns an empty list when the form carries no payload", () => {
    expect(parseTemplateFieldValues(new FormData())).toEqual({ ok: true, values: [] });
  });

  it("reads a plain value", () => {
    const result = parseTemplateFieldValues(withPayload([{ templateFieldId: "field-1", value: "Cheaper than renting" }]));
    expect(result).toEqual({ ok: true, values: [{ templateFieldId: "field-1", value: "Cheaper than renting", targetObjectIds: [] }] });
  });

  it("reads and de-duplicates Kinesis Link targets", () => {
    const result = parseTemplateFieldValues(withPayload([{ templateFieldId: "field-1", value: "", targetObjectIds: ["goal-1", "goal-1", "goal-2"] }]));
    expect(result).toEqual({ ok: true, values: [{ templateFieldId: "field-1", value: "", targetObjectIds: ["goal-1", "goal-2"] }] });
  });

  it("drops an entry with no template field id", () => {
    const result = parseTemplateFieldValues(withPayload([{ value: "orphaned" }, { templateFieldId: "field-1", value: "kept" }]));
    expect(result).toEqual({ ok: true, values: [{ templateFieldId: "field-1", value: "kept", targetObjectIds: [] }] });
  });

  it("reports an error for a payload that isn't JSON", () => {
    const data = new FormData();
    data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, "{not json");
    expect(parseTemplateFieldValues(data).ok).toBe(false);
  });

  it("reports an error for a JSON payload that isn't an array", () => {
    const data = new FormData();
    data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify({ not: "an array" }));
    expect(parseTemplateFieldValues(data).ok).toBe(false);
  });
});
