import { describe, expect, it } from "vitest";
import { freshestStamp } from "@/lib/actions/concurrency";

/**
 * The one piece of client logic every BUG-007 form shares: which `updatedAt`
 * to resubmit next, the page's own prop or a more recent one a prior save on
 * this same form already returned. Pulled out to its own module (and this
 * test) after EditDocumentForm.tsx, EditCustomItemForm.tsx, and
 * TemplateDetailForm.tsx all reimplemented the same comparison independently.
 */
describe("freshestStamp", () => {
  it("keeps the page's own prop when there is no candidate yet", () => {
    expect(freshestStamp("2024-01-01T00:00:00.000Z", undefined)).toBe("2024-01-01T00:00:00.000Z");
  });

  it("prefers a candidate newer than the page's prop", () => {
    expect(freshestStamp("2024-01-01T00:00:00.000Z", "2024-01-02T00:00:00.000Z")).toBe("2024-01-02T00:00:00.000Z");
  });

  it("keeps the page's own prop over an older candidate", () => {
    // Shouldn't arise in practice (a save only ever returns a newer stamp
    // than what it started from), but the comparison itself must not
    // regress to a stale value if it ever does.
    expect(freshestStamp("2024-01-02T00:00:00.000Z", "2024-01-01T00:00:00.000Z")).toBe("2024-01-02T00:00:00.000Z");
  });

  it("keeps the page's own prop when the candidate exactly matches", () => {
    expect(freshestStamp("2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z")).toBe("2024-01-01T00:00:00.000Z");
  });
});
