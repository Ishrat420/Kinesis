import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { ModuleContent } from "@/components/layout/ModuleContent";

/**
 * One answer for every `notFound()` inside the shell.
 *
 * The modules disagreed about this: goals and custom modules called
 * `notFound()` and got Next.js's bare default, while a missing document
 * rendered a tailored card with a way back. This is that card, reachable from
 * every module, so the two stop diverging.
 */
export default function AppNotFound() {
  return (
    <ModuleContent width="narrow">
      <section className="rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
          <FileQuestion className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-zinc-950">This isn&apos;t here</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Whatever you were looking for has been deleted, or the link points somewhere Kinesis doesn&apos;t have.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
        >Back to the dashboard</Link>
      </section>
    </ModuleContent>
  );
}
