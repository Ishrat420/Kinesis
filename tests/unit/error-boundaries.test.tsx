import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../app/globals.css", () => ({}));

import AppError from "@/app/(app)/error";
import GlobalError from "@/app/global-error";
import AppNotFound from "@/app/(app)/not-found";

/**
 * An error boundary that throws is worse than none at all: it escalates to the
 * boundary above it, and for `global-error` there is nothing above. These render
 * the fallbacks the way Next.js will, with the props it actually passes.
 *
 * What this cannot cover is the wiring -- that a thrown Server Component lands
 * here at all -- which is the file convention's job and needs a running app with
 * a real session to see.
 */
const failure = Object.assign(new Error("connection reset"), { digest: "3821094857" });
const retry = () => {};

describe("the error fallbacks render", () => {
  it("shows the segment boundary without throwing", () => {
    const html = renderToStaticMarkup(<AppError error={failure} unstable_retry={retry} />);
    expect(html).toContain("This page didn&#x27;t load");
    expect(html).toContain("Try again");
  });

  /**
   * The digest is the only thread between this screen and the server log line
   * that says what actually happened: Next.js redacts the message itself.
   */
  it("shows the digest so it can be matched against the server logs", () => {
    expect(renderToStaticMarkup(<AppError error={failure} unstable_retry={retry} />)).toContain("3821094857");
    expect(renderToStaticMarkup(<GlobalError error={failure} unstable_retry={retry} />)).toContain("3821094857");
  });

  it("omits the reference line when there is no digest", () => {
    const html = renderToStaticMarkup(<AppError error={new Error("client-side")} unstable_retry={retry} />);
    expect(html).not.toContain("Reference");
  });

  /** It replaces the root layout, so nothing else will supply these. */
  it("gives the global boundary its own document", () => {
    const html = renderToStaticMarkup(<GlobalError error={failure} unstable_retry={retry} />);
    expect(html).toContain("<html");
    expect(html).toContain("<body");
    expect(html).toContain("<title>Kinesis</title>");
  });

  it("renders one answer for a missing record", () => {
    const html = renderToStaticMarkup(<AppNotFound />);
    expect(html).toContain("This isn&#x27;t here");
    expect(html).toContain("Back to the dashboard");
  });
});
