import { Settings, User } from "lucide-react";
import { getRecentNotifications } from "@/lib/data/notifications";
import { CommandBar } from "@/components/capture/CommandBar";
import { NotificationBell } from "./NotificationBell";
import { TopbarBack } from "./TopbarBack";
import { AppBadge } from "@/components/pwa/AppBadge";
import { UserButton } from "@clerk/nextjs";
import { Z_INDEX } from "@/lib/layout/z-index";

export async function Topbar() {
  // No search index fetched here anymore: CommandBar asks for results itself,
  // only once someone actually types, instead of every page paying for a full
  // read across every searchable table whether or not search is ever opened
  // that visit -- see lib/search/providers.ts.
  const { enabled: notificationsEnabled, notifications, unreadCount } = await getRecentNotifications();

  return (
    // In the installed app the page runs edge to edge (viewport-fit=cover, for
    // the tab bar), so the status bar and Dynamic Island sit over the top of
    // it. The bar grows by that inset and keeps its 72px row below it.
    <header className={`sticky top-0 ${Z_INDEX.chrome} h-[calc(72px+env(safe-area-inset-top))] border-b border-zinc-200/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur`}>
      {/*
        Below md the bar is a plain row -- back (on inner pages), search, then actions -- so the search
        field takes whatever width is left instead of being squeezed between two
        fixed insets. Navigation on a phone is the bottom tab bar (KD-054). From md the search goes back to being absolutely centred
        across the full header, which is the desktop layout and must not change.
      */}
      <div className="relative flex h-full items-center gap-3 px-4 sm:px-8">
        <TopbarBack />

        <div className="flex min-w-0 flex-1 md:absolute md:left-8 md:right-40 md:justify-center">
          <CommandBar />
        </div>

        <div className="relative ml-auto flex shrink-0 items-center gap-3">
          {/* With notifications off there's no bell, so no number on the app icon either. */}
          {notificationsEnabled ? <NotificationBell notifications={notifications} initialUnreadCount={unreadCount} /> : <AppBadge count={0} />}

          <UserButton appearance={{ elements: { avatarBox: "h-11 w-11 border border-zinc-200/80 shadow-sm" } }}>
            <UserButton.MenuItems>
              <UserButton.Link label="Personal profile" labelIcon={<User className="h-4 w-4" />} href="/user" />
              <UserButton.Link label="Settings" labelIcon={<Settings className="h-4 w-4" />} href="/settings" />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>
    </header>
  );
}
