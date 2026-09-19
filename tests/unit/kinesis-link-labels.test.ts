import { describe, expect, it } from "vitest";
import {
  CUSTOM_KINESIS_LINK_OPTION_VALUE,
  KINESIS_LINK_DIRECTION_OPTIONS,
  kinesisLinkDirectionValue,
  kinesisLinkLabel,
  parseKinesisLinkDirectionValue,
} from "@/lib/objects/relationship-labels";

describe("kinesisLinkLabel: the label shown for a Kinesis Link, from the current Object's side", () => {
  it("resolves a canonical type through the shared forward/inverse table", () => {
    expect(kinesisLinkLabel("DEPENDS_ON", null, false)).toBe("Depends on");
    expect(kinesisLinkLabel("DEPENDS_ON", null, true)).toBe("Required for");
  });

  it("reads a CUSTOM link's own typed text instead of a canonical lookup", () => {
    expect(kinesisLinkLabel("CUSTOM", "Emergency contact", false)).toBe("Emergency contact");
    expect(kinesisLinkLabel("CUSTOM", "Emergency contact", true)).toBe("Emergency contact");
  });

  it("falls back rather than showing nothing for a CUSTOM link with no text somehow stored", () => {
    expect(kinesisLinkLabel("CUSTOM", null, false)).toBe("Related to");
  });
});

describe("KINESIS_LINK_DIRECTION_OPTIONS: the picker's 8 canonical choices", () => {
  it("offers exactly 8 options -- both directions of the 3 asymmetric types, one each for the 2 symmetric ones", () => {
    expect(KINESIS_LINK_DIRECTION_OPTIONS).toHaveLength(8);
    expect(KINESIS_LINK_DIRECTION_OPTIONS.map((option) => option.label)).toEqual([
      "Supports", "Supported by", "Blocks", "Blocked by", "Depends on", "Required for", "Related to", "Alongside",
    ]);
  });

  it("does not include the Custom sentinel as one of the 8 -- that's a 9th option added by the picker itself", () => {
    expect(KINESIS_LINK_DIRECTION_OPTIONS.some((option) => option.value === CUSTOM_KINESIS_LINK_OPTION_VALUE)).toBe(false);
  });
});

describe("parseKinesisLinkDirectionValue: reading a submitted picker choice back", () => {
  it("recovers the type and direction for a forward option", () => {
    expect(parseKinesisLinkDirectionValue("DEPENDS_ON|forward")).toEqual({ type: "DEPENDS_ON", inverse: false });
  });

  it("recovers the type and direction for an inverse option", () => {
    expect(parseKinesisLinkDirectionValue("DEPENDS_ON|inverse")).toEqual({ type: "DEPENDS_ON", inverse: true });
  });

  it("returns null for a symmetric type's non-existent inverse option, rather than inventing one", () => {
    expect(parseKinesisLinkDirectionValue("RELATES_TO|inverse")).toBeNull();
  });

  it("returns null for the Custom sentinel -- that is handled separately, not as a canonical direction", () => {
    expect(parseKinesisLinkDirectionValue(CUSTOM_KINESIS_LINK_OPTION_VALUE)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseKinesisLinkDirectionValue("not-a-real-value")).toBeNull();
  });
});

describe("kinesisLinkDirectionValue: preselecting the picker for an existing Kinesis Link", () => {
  it("round-trips an asymmetric type in both directions", () => {
    expect(kinesisLinkDirectionValue("DEPENDS_ON", false)).toBe("DEPENDS_ON|forward");
    expect(kinesisLinkDirectionValue("DEPENDS_ON", true)).toBe("DEPENDS_ON|inverse");
  });

  it("falls back to the forward option for a symmetric type stored as inverse -- there is no separate inverse option to match", () => {
    expect(kinesisLinkDirectionValue("RELATES_TO", true)).toBe("RELATES_TO|forward");
    expect(kinesisLinkDirectionValue("ALONGSIDE", true)).toBe("ALONGSIDE|forward");
  });
});
