import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";

const widths = {
  narrow: "max-w-3xl",
  standard: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

export type ModuleLayoutWidth = keyof typeof widths;

/**
 * The application shell every signed-in page renders inside.
 *
 * Owning the top bar, the sidebar, and the content padding in one place is what
 * keeps navigation identical across modules — pages supply content only.
 */
export function ModuleLayout({
  width = "wide",
  children,
}: {
  width?: ModuleLayoutWidth;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />

      <div className="flex">
        <Sidebar />

        <section className="min-w-0 flex-1 px-6 py-8 md:px-10">
          <div className={widths[width]}>{children}</div>
        </section>
      </div>
    </main>
  );
}
