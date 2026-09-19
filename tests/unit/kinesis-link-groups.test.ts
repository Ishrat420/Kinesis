import { describe, expect, it } from "vitest";
import { groupKinesisLinksByLabel } from "@/lib/objects/kinesis-link-groups";

const link = (id: string, label: string) => ({ id, label });

describe("groupKinesisLinksByLabel: one flat list, grouped by resolved label (KD-049 §4)", () => {
  it("puts links that resolve to the same label under one group", () => {
    const groups = groupKinesisLinksByLabel([link("a", "Supports"), link("b", "Supports"), link("c", "Blocks")]);
    expect(groups).toEqual([
      { label: "Supports", links: [link("a", "Supports"), link("b", "Supports")] },
      { label: "Blocks", links: [link("c", "Blocks")] },
    ]);
  });

  it("orders groups by first appearance, not alphabetically", () => {
    const groups = groupKinesisLinksByLabel([link("a", "Alongside"), link("b", "Depends on")]);
    expect(groups.map((group) => group.label)).toEqual(["Alongside", "Depends on"]);
  });

  it("never merges an inverse label into its forward counterpart -- they are different strings", () => {
    const groups = groupKinesisLinksByLabel([link("a", "Depends on"), link("b", "Required for")]);
    expect(groups.map((group) => group.label)).toEqual(["Depends on", "Required for"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupKinesisLinksByLabel([])).toEqual([]);
  });
});
