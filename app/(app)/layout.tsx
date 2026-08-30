import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";

/**
 * The Kinesis application shell.
 *
 * Every authenticated route renders inside this layout, so the sidebar, global
 * search, notifications, and profile access stay mounted while only the content
 * area changes. Pages supply content only — see ModuleContent for the content
 * widths, and ModuleHeader for the standard page header.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />

      <div className="flex">
        <Sidebar />

        <section className="min-w-0 flex-1 px-4 py-8 sm:px-6 md:px-10">{children}</section>
      </div>
    </main>
  );
}
