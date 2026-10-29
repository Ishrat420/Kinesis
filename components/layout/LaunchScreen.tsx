import Image from "next/image";
import kinesisIcon from "@/app/icon.png";

/**
 * What a cold open of Kinesis shows while the app shell gets ready.
 *
 * The shell (app/(app)/layout.tsx) reads settings and notifications before it
 * can render, and the per-page loading.tsx files sit inside it, so without
 * this the first open is a blank page until the database answers. Rendered
 * by app/loading.tsx, which wraps that layout; once the shell is up, moving
 * between pages uses the page skeletons instead and this never shows again.
 */
export function LaunchScreen() {
  return (
    <div role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5 text-zinc-950">
      <div className="flex flex-col items-center">
        <Image src={kinesisIcon} alt="" width={64} height={64} className="launch-breathe rounded-2xl shadow-sm" priority />
        <p className="mt-6 text-sm font-semibold tracking-[-0.01em] text-zinc-900">Kinesis</p>
        <div className="mt-4 h-1 w-28 overflow-hidden rounded-full bg-zinc-200">
          <div className="launch-bar h-full w-1/3 rounded-full bg-zinc-900" />
        </div>
        <span className="sr-only">Loading Kinesis</span>
      </div>
    </div>
  );
}
