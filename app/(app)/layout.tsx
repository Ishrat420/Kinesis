import { Sidebar, SidebarNav } from "@/components/navigation/Sidebar";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { Topbar } from "@/components/navigation/Topbar";
import { FormatProvider } from "@/lib/format/context";
import { getFormatPreferences } from "@/lib/format/server";
import { PAGE_PADDING } from "@/lib/layout/responsive";
import { PwaClient } from "@/components/pwa/PwaClient";
import { PullToRefresh } from "@/components/pwa/PullToRefresh";

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
export default async function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const formatPreferences = await getFormatPreferences();

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <FormatProvider preferences={formatPreferences}>
        <Topbar />

        <div className="flex">
          <Sidebar />

          {/* On a phone the bottom padding clears the floating tab bar, so a
              page's last row is never left underneath it. */}
          <section className={`min-w-0 flex-1 pt-8 pb-(--tab-bar-clearance) md:pb-8 ${PAGE_PADDING}`}>{children}</section>
        </div>

        <MobileTabBar>
          <SidebarNav withOverview={false} />
        </MobileTabBar>

        {modal}

        <PwaClient />
        <PullToRefresh />
      </FormatProvider>
    </main>
  );
}
