/**
 * Shared styling for sidebar navigation entries so every module link — built in
 * or custom — renders the same resting, hover, and active treatment.
 */
export function navItemClassName(active: boolean) {
  return `flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-200 ${
    active
      ? "bg-zinc-950 text-white shadow-[0_8px_24px_rgb(0,0,0,0.12)]"
      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
  }`;
}
