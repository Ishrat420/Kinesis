import { describe, expect, it } from "vitest";
import { checkLength, checkNumberMagnitude, LINK_LIMIT, NOTES_LIMIT, NUMBER_MAGNITUDE_LIMIT, TEXT_LIMIT } from "@/lib/validation/field-limits";

describe("checkLength", () => {
  it("accepts a value at or under the limit", () => {
    expect(checkLength("a".repeat(TEXT_LIMIT), TEXT_LIMIT, "the field")).toBeNull();
  });

  it("refuses a value one character over the limit, naming the field", () => {
    expect(checkLength("a".repeat(TEXT_LIMIT + 1), TEXT_LIMIT, "the category")).toBe(`Keep the category under ${TEXT_LIMIT} characters.`);
  });

  it("treats null, undefined, and empty as always fine -- required-ness is a separate rule", () => {
    expect(checkLength(null, TEXT_LIMIT, "the field")).toBeNull();
    expect(checkLength(undefined, TEXT_LIMIT, "the field")).toBeNull();
    expect(checkLength("", TEXT_LIMIT, "the field")).toBeNull();
  });

  it("works at every named tier", () => {
    expect(checkLength("a".repeat(NOTES_LIMIT + 1), NOTES_LIMIT, "the notes")).toContain(NOTES_LIMIT.toLocaleString());
    expect(checkLength("a".repeat(LINK_LIMIT + 1), LINK_LIMIT, "the link")).toContain(LINK_LIMIT.toLocaleString());
  });
});

describe("checkNumberMagnitude", () => {
  it("accepts a value at or under the ceiling", () => {
    expect(checkNumberMagnitude(NUMBER_MAGNITUDE_LIMIT, "the amount")).toBeNull();
    expect(checkNumberMagnitude(-NUMBER_MAGNITUDE_LIMIT, "the amount")).toBeNull();
  });

  it("refuses a magnitude over the ceiling, in either direction, naming the field", () => {
    expect(checkNumberMagnitude(NUMBER_MAGNITUDE_LIMIT + 1, "the amount")).toBe(`Keep the amount under ${NUMBER_MAGNITUDE_LIMIT.toLocaleString()}.`);
    expect(checkNumberMagnitude(-(NUMBER_MAGNITUDE_LIMIT + 1), "the amount")).toEqual(expect.any(String));
  });

  it("treats null, undefined, NaN, and Infinity as this check's own no-op -- format validation is a separate rule", () => {
    expect(checkNumberMagnitude(null, "the field")).toBeNull();
    expect(checkNumberMagnitude(undefined, "the field")).toBeNull();
    expect(checkNumberMagnitude(NaN, "the field")).toBeNull();
    expect(checkNumberMagnitude(Infinity, "the field")).toBeNull();
  });
});
