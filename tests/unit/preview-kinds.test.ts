import { describe, expect, it } from "vitest";
import { formatPreviewValue, resolveKind, truncateLabel } from "@/lib/custom-fields/kinds";

const context = { locale: "en-US", currency: "USD", today: new Date("2026-01-01T00:00:00.000Z") };

describe("resolveKind", () => {
  it("maps a custom field's stored type to its display kind", () => {
    expect(resolveKind("TEXT")).toBe("text");
    expect(resolveKind("DATE")).toBe("date");
    expect(resolveKind("KINESIS_LINK")).toBe("link-count");
    expect(resolveKind("NUMBER")).toBe("number");
    expect(resolveKind("NUMBER", "CURRENCY")).toBe("currency");
    expect(resolveKind("NUMBER", "PERCENT")).toBe("percent");
    expect(resolveKind("CHECKBOX")).toBe("boolean");
  });

  it("has no kind for a type that can't ever be a preview field", () => {
    expect(resolveKind("LINK")).toBeNull();
  });
});

describe("formatPreviewValue", () => {
  it("drops a blank value rather than rendering an empty stat", () => {
    expect(formatPreviewValue("text", { value: "" }, context)).toBeNull();
    expect(formatPreviewValue("text", { value: "   " }, context)).toBeNull();
    expect(formatPreviewValue("currency", {}, context)).toBeNull();
  });

  it("renders a checkbox's true/false state as text, never dropping it as blank", () => {
    expect(formatPreviewValue("boolean", { value: "true" }, context)).toBe("True");
    expect(formatPreviewValue("boolean", { value: "false" }, context)).toBe("False");
    expect(formatPreviewValue("boolean", { value: "" }, context)).toBe("False");
    expect(formatPreviewValue("boolean", {}, context)).toBe("False");
  });

  it("drops a link-count of zero, but not a positive one", () => {
    expect(formatPreviewValue("link-count", { linkCount: 0 }, context)).toBeNull();
    expect(formatPreviewValue("link-count", {}, context)).toBeNull();
    expect(formatPreviewValue("link-count", { linkCount: 3 }, context)).toBe("3 linked");
  });

  it("drops a value that doesn't parse for its kind", () => {
    expect(formatPreviewValue("date", { value: "not a date" }, context)).toBeNull();
    expect(formatPreviewValue("number", { value: "not a number" }, context)).toBeNull();
  });

  it("formats number, currency and percent through the app's shared formatters", () => {
    expect(formatPreviewValue("number", { value: "1234.5" }, context)).toBe("1,234.5");
    expect(formatPreviewValue("currency", { value: "2140" }, context)).toBe("$2,140");
    expect(formatPreviewValue("percent", { value: "15.24" }, context)).toBe("15.2%");
  });

  it("truncates a status value to a hard cap so a badge never wraps", () => {
    const long = "A".repeat(50);
    const value = formatPreviewValue("status", { value: long }, context)!;
    expect(value.length).toBeLessThanOrEqual(24);
    expect(value.endsWith("…")).toBe(true);
  });

  /**
   * The bug this guards against: getGoalPreviews used to build its two
   * stats as plain object literals instead of calling formatPreviewValue at
   * all, so a Goal's derived "X of Y" sentence had no length cap even
   * though it's built with the `text` kind specifically to get one.
   */
  it("truncates a text value to a hard cap, long enough to read as a sentence fragment", () => {
    const long = "10 " + "Kilometres run towards my personal marathon training goal ".repeat(3);
    const value = formatPreviewValue("text", { value: long }, context)!;
    expect(value.length).toBeLessThanOrEqual(40);
    expect(value.endsWith("…")).toBe(true);
  });
});

describe("truncateLabel", () => {
  it("leaves a normal label untouched", () => {
    expect(truncateLabel("Interest rate")).toBe("Interest rate");
  });

  it("trims surrounding whitespace", () => {
    expect(truncateLabel("  Country  ")).toBe("Country");
  });

  /**
   * The bug this guards against: a stat's label was never passed through
   * any shared formatter at all, only its value was -- so a long custom
   * field label, document field label, or goal unit flowed straight onto
   * a card with no cap.
   */
  it("truncates a long label the same way a status value is capped", () => {
    const long = "Kilometres run towards my personal marathon training goal this year";
    const label = truncateLabel(long);
    expect(label.length).toBeLessThanOrEqual(24);
    expect(label.endsWith("…")).toBe(true);
  });
});
