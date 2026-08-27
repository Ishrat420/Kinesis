import { describe, expect, it } from "vitest";
import { parseKinesisTarget } from "@/lib/custom-fields/types";

describe("parseKinesisTarget", () => {
  it.each(["DOCUMENT", "CUSTOM_ITEM", "GOAL"] as const)("parses a %s target", (type) => {
    expect(parseKinesisTarget(`${type}:object-id`)).toEqual({
      targetType: type,
      targetId: "object-id",
    });
  });

  it.each(["", "GOAL:", "UNKNOWN:object-id"])("rejects an invalid target: %s", (value) => {
    expect(parseKinesisTarget(value)).toBeNull();
  });
});
