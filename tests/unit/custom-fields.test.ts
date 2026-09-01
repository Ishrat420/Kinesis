import { describe, expect, it } from "vitest";
import { KINESIS_LINK_TARGET_TYPES } from "@/lib/custom-fields/types";

describe("Kinesis link targets", () => {
  it("offers only the object types a link can resolve to a page", () => {
    expect([...KINESIS_LINK_TARGET_TYPES]).toEqual(["DOCUMENT", "CUSTOM_ITEM", "GOAL"]);
  });
});
