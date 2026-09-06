"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The boundary for everything inside the application shell.
 *
 * This wraps each page, but *not* the layout in its own segment, so the sidebar
 * and top bar stay put and only the content area is replaced. A failure in the
 * shell itself -- the top bar reads notifications and the search index on every
 * render, which is the likeliest thing in Kinesis to fall over -- goes past this
 * to app/global-error.tsx instead.
 *
 * The digest is shown rather than hidden. Next.js redacts the message of a
 * server-side error before it reaches the browser and leaves this hash in its
 * place; it is the only thing that ties what happened here to the line in the
 * server logs that says why. On a single-owner deployment the person reading
 * this page is also the person who would go looking.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="max-w-3xl">
      <section className="rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-zinc-950">This page didn&apos;t load</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Something went wrong on the way to rendering it. Nothing you were looking at has been changed — trying again is safe.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {/*
            `unstable_retry` re-fetches and re-renders, which is what recovers a
            Server Component that threw. The `reset` prop beside it only clears
            the error state, so a page whose data still fails would fall straight
            back to here.
          */}
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
          ><RotateCcw className="h-4 w-4" />Try again</button>
          <Link
            href="/"
            className="inline-flex items-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >Back to the dashboard</Link>
        </div>

        {error.digest && (
          <p className="mt-6 border-t border-zinc-100 pt-4 text-xs text-zinc-400">
            Reference <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-600">{error.digest}</code> — quote this to find the matching line in the server logs.
          </p>
        )}
      </section>
    </div>
  );
}
