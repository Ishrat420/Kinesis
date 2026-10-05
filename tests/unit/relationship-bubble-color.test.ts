import { describe, expect, it } from "vitest";
import { BUBBLE_COLORS, pickBubbleColor } from "@/lib/relationships";

describe("pickBubbleColor", () => {
  it("picks among the colours nobody on the map is wearing", () => {
    const taken = BUBBLE_COLORS.slice(0, 5);
    for (const random of [0, 0.3, 0.6, 0.99]) {
      const color = pickBubbleColor(taken, () => random);
      expect(BUBBLE_COLORS).toContain(color);
      expect(taken).not.toContain(color);
    }
  });

  it("doesn't keep handing out the same colour when the first one is free", () => {
    const picks = new Set([0, 0.25, 0.5, 0.75, 0.99].map((random) => pickBubbleColor([], () => random)));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("still picks a palette colour once every one is taken", () => {
    expect(BUBBLE_COLORS).toContain(pickBubbleColor([...BUBBLE_COLORS], () => 0.5));
  });

  it("never hands a new person the dark colour reserved for you", () => {
    for (let index = 0; index < 50; index += 1) expect(pickBubbleColor([], () => index / 50)).not.toBe("#292524");
  });
});
