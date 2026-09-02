import { describe, expect, it } from "vitest";
import { parseDatedFieldValue, resolveDatedFields } from "@/lib/calendar/dated-fields";

describe("parseDatedFieldValue: recognizing a valid date-shaped value", () => {
  it("parses an ISO date string", () => {
    expect(parseDatedFieldValue("2026-07-01")?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("returns null for a value that isn't a date at all", () => {
    expect(parseDatedFieldValue("not a date")).toBeNull();
  });

  it("returns null for an empty value", () => {
    expect(parseDatedFieldValue("")).toBeNull();
  });
});

describe("resolveDatedFields: which custom fields belong on the calendar", () => {
  it("keeps only fields typed as DATE, regardless of their label", () => {
    const fields = [
      { id: "1", label: "Vervaldatum", value: "2026-07-01", type: "DATE" },
      { id: "2", label: "Notes", value: "2026-08-01", type: "TEXT" },
      { id: "3", label: "Amount", value: "42", type: "NUMBER" },
    ];

    expect(resolveDatedFields(fields).map((field) => field.id)).toEqual(["1"]);
  });

  it("does not rely on the label matching an English due-date pattern", () => {
    // A field literally labelled in another language must still surface, since
    // detection is keyed on the field's type, never on parsing its label text.
    const fields = [{ id: "1", label: "到期日", value: "2026-07-01", type: "DATE" }];

    expect(resolveDatedFields(fields)).toHaveLength(1);
  });

  it("drops a DATE-typed field whose stored value doesn't actually parse", () => {
    const fields = [{ id: "1", label: "Due", value: "not a date", type: "DATE" }];

    expect(resolveDatedFields(fields)).toEqual([]);
  });

  it("pairs each surviving field with its parsed date", () => {
    const fields = [{ id: "1", label: "Renewal", value: "2026-07-01", type: "DATE" }];

    expect(resolveDatedFields(fields)).toEqual([{ id: "1", label: "Renewal", date: new Date("2026-07-01T00:00:00.000Z") }]);
  });
});
