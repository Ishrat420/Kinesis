import { describe, expect, it } from "vitest";
import { formatActivityTime, formatActivityTimeShort, formatDate } from "@/lib/dates";

const now = new Date("2026-10-02T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("the dashboard's short activity time (phones)", () => {
  it("abbreviates each step of the long form", () => {
    expect(formatActivityTimeShort(ago(30), now)).toBe("now");
    expect(formatActivityTimeShort(ago(60), now)).toBe("1m");
    expect(formatActivityTimeShort(ago(59 * 60), now)).toBe("59m");
    expect(formatActivityTimeShort(ago(3_600), now)).toBe("1h");
    expect(formatActivityTimeShort(ago(23 * 3_600), now)).toBe("23h");
    expect(formatActivityTimeShort(ago(24 * 3_600), now)).toBe("1d");
    expect(formatActivityTimeShort(ago(6 * 24 * 3_600), now)).toBe("6d");
  });

  it("falls back to the date after a week, in the owner's locale", () => {
    const old = ago(8 * 24 * 3_600);
    expect(formatActivityTimeShort(old, now, "en-AU")).toBe(formatDate(old, "en-AU"));
  });

  it("never disagrees with the long form on which step a moment is in", () => {
    for (const seconds of [0, 59, 60, 3_599, 3_600, 86_399, 86_400, 604_799, 604_800]) {
      const long = formatActivityTime(ago(seconds), now, "en-AU");
      const short = formatActivityTimeShort(ago(seconds), now, "en-AU");
      const step = (text: string) => text === "now" ? "now" : /minute|\dm$/.test(text) ? "m" : /hour|\dh$/.test(text) ? "h" : /day|\dd$/.test(text) ? "d" : "date";
      expect(step(short), `${seconds}s: ${long} / ${short}`).toBe(step(long));
    }
  });
});
