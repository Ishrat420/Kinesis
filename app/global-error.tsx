"use client";

import "./globals.css";

/**
 * The boundary of last resort, and in Kinesis not a rare one.
 *
 * `error.tsx` cannot catch a failure in the layout of its own segment, and the
 * application shell's top bar awaits the notification engine and the whole
 * search index on every render. So the most database-dependent code in the app
 * sits above the segment boundary and lands here instead.
 *
 * This replaces the root layout when it renders, which is why it carries its own
 * `<html>` and `<body>`: none of the shell above it exists at this point. Error
 * boundaries are Client Components, so `metadata` cannot be exported -- the tab
 * title is a plain `<title>` element.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f7f8fb] font-sans text-zinc-950 antialiased">
        <title>Kinesis</title>
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <section className="rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Kinesis</p>
            <h1 className="mt-3 text-2xl font-semibold">Kinesis couldn&apos;t start this page</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              The failure happened in the application shell itself, so the page could not be drawn around it. Your data has not been touched.
            </p>

            <button
              type="button"
              onClick={() => unstable_retry()}
              className="mt-6 inline-flex items-center rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
            >Try again</button>

            {error.digest && (
              <p className="mt-6 border-t border-zinc-100 pt-4 text-xs text-zinc-400">
                Reference <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-600">{error.digest}</code> — quote this to find the matching line in the server logs.
              </p>
            )}
          </section>
        </main>
      </body>
    </html>
  );
}
