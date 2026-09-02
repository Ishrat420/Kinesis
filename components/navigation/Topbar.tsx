import { Settings, User } from "lucide-react";
import { getRecentNotifications } from "@/lib/data/notifications";
import { CommandBar } from "@/components/capture/CommandBar";
import { NotificationBell } from "./NotificationBell";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { SidebarBrand, SidebarNav } from "./Sidebar";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getGlobalSearchIndex } from "@/lib/search/engine";
import { UserButton } from "@clerk/nextjs";

export async function Topbar() {
  const [{ notifications, unreadCount }, user, searchEntries] = await Promise.all([
    getRecentNotifications(),
    getCurrentUser(),
    getGlobalSearchIndex(),
  ]);

  return (
    <header className="sticky top-0 z-30 h-[72px] border-b border-zinc-200/80 bg-white/90 backdrop-blur">
      <div className="relative flex h-full items-center justify-end px-4 sm:px-8">
        <div className="absolute left-4 md:hidden">
          <MobileNavDrawer>
            <SidebarBrand />
            <SidebarNav />
          </MobileNavDrawer>
        </div>

        <div className="absolute left-20 right-32 flex justify-center sm:right-40 md:left-8">
          <CommandBar entries={searchEntries.map((entry) => entry.id === "person:self" ? { ...entry, title: getUserDisplayName(user) } : entry)} />
        </div>

        <div className="relative flex items-center gap-3">
          <NotificationBell key={`${unreadCount}:${notifications.map(({ id, readAt }) => `${id}:${readAt?.getTime() ?? "unread"}`).join(",")}`} notifications={notifications} initialUnreadCount={unreadCount} />

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
