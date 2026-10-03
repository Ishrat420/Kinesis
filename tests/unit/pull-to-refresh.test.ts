import { describe, expect, it } from "vitest";
import { PULL_MAX, PULL_THRESHOLD, pullOffset } from "@/lib/pwa/pull-to-refresh";

describe("pullOffset", () => {
  it("doesn't move for an upward or zero drag", () => {
    expect(pullOffset(0)).toBe(0);
    expect(pullOffset(-40)).toBe(0);
  });

  it("follows the finger at half speed, so it feels weighted", () => {
    expect(pullOffset(40)).toBe(20);
  });

  it("needs a deliberate pull, not a nudge, to reach the threshold", () => {
    expect(pullOffset(100)).toBeLessThan(PULL_THRESHOLD);
    expect(pullOffset(200)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });

  it("never runs past its maximum however far you drag", () => {
    expect(pullOffset(5000)).toBe(PULL_MAX);
  });
});
