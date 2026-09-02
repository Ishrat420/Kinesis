import { describe, expect, it } from "vitest";
import { KINESIS_LINK_TARGET_TYPES, kinesisLinkTargetOrder } from "@/lib/custom-fields/types";

describe("Kinesis link targets", () => {
  it("offers only the object types a link can resolve to a page, in picker order", () => {
    expect(KINESIS_LINK_TARGET_TYPES).toEqual(["DOCUMENT", "CUSTOM_ITEM", "GOAL"]);
  });

  it("reads picker order from each type's own order, not the allowed-types list's position", () => {
    // Membership and order come from independent properties on the config, so
    // this asserts them separately rather than through one array's shape.
    expect(kinesisLinkTargetOrder("DOCUMENT")).toBeLessThan(kinesisLinkTargetOrder("CUSTOM_ITEM"));
    expect(kinesisLinkTargetOrder("CUSTOM_ITEM")).toBeLessThan(kinesisLinkTargetOrder("GOAL"));
  });
});
