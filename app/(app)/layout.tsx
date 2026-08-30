import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { FormatProvider } from "@/lib/format/context";
import { getFormatPreferences } from "@/lib/format/server";

/**
 * The Kinesis application shell.
 *
 * Every authenticated route renders inside this layout, so the sidebar, global
 * search, notifications, and profile access stay mounted while only the content
 * area changes. Pages supply content only — see ModuleContent for the content
 * widths, and ModuleHeader for the standard page header.
 *
 * Regional preferences resolve here so Client Components format dates and
 * amounts exactly as Server Components do and hydration stays stable.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const formatPreferences = await getFormatPreferences();

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <FormatProvider preferences={formatPreferences}>
        <Topbar />

        <div className="flex">
          <Sidebar />

          <section className="min-w-0 flex-1 px-4 py-8 sm:px-6 md:px-10">{children}</section>
        </div>
      </FormatProvider>
    </main>
  );
}
