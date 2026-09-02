import { describe, expect, it } from "vitest";
import { parseDatedFieldValue, resolveDatedFields } from "@/lib/calendar/dated-fields";

describe("parseDatedFieldValue: recognizing a valid date-shaped value", () => {
  it("parses the dd/mm/yyyy format the field editor actually stores", () => {
    expect(parseDatedFieldValue("01/02/2026")?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("does not swap day and month the way new Date() alone would", () => {
    // new Date("25/12/2026") is Invalid Date, and new Date("01/02/2026") reads
    // as 2 January -- both wrong for a field a person filled in as dd/mm/yyyy.
    expect(parseDatedFieldValue("25/12/2026")?.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(parseDatedFieldValue("01/02/2026")?.toISOString()).not.toBe(new Date("01/02/2026").toISOString());
  });

  it("rejects a dd/mm/yyyy-shaped value whose day or month is out of range", () => {
    expect(parseDatedFieldValue("32/01/2026")).toBeNull();
    expect(parseDatedFieldValue("01/13/2026")).toBeNull();
  });

  it("still parses an ISO date string, in case a value ever arrives in that shape", () => {
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
      { id: "1", label: "Vervaldatum", value: "01/07/2026", type: "DATE" },
      { id: "2", label: "Notes", value: "01/08/2026", type: "TEXT" },
      { id: "3", label: "Amount", value: "42", type: "NUMBER" },
    ];

    expect(resolveDatedFields(fields).map((field) => field.id)).toEqual(["1"]);
  });

  it("does not rely on the label matching an English due-date pattern", () => {
    // A field literally labelled in another language must still surface, since
    // detection is keyed on the field's type, never on parsing its label text.
    const fields = [{ id: "1", label: "到期日", value: "01/07/2026", type: "DATE" }];

    expect(resolveDatedFields(fields)).toHaveLength(1);
  });

  it("drops a DATE-typed field whose stored value doesn't actually parse", () => {
    const fields = [{ id: "1", label: "Due", value: "not a date", type: "DATE" }];

    expect(resolveDatedFields(fields)).toEqual([]);
  });

  it("pairs each surviving field with its parsed date, read as dd/mm/yyyy", () => {
    const fields = [{ id: "1", label: "Renewal", value: "25/12/2026", type: "DATE" }];

    expect(resolveDatedFields(fields)).toEqual([{ id: "1", label: "Renewal", date: new Date("2026-12-25T00:00:00.000Z") }]);
  });
});
