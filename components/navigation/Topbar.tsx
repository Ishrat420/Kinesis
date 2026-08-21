import { Command, Search, User } from "lucide-react";
import { getRecentNotifications } from "@/lib/data/notifications";
import { NotificationBell } from "./NotificationBell";

export async function Topbar() {
  const { notifications, unreadCount } = await getRecentNotifications();
  return (
    <header className="sticky top-0 z-30 h-[72px] border-b border-zinc-200/80 bg-white/90 backdrop-blur">
      <div className="flex h-full items-center justify-between px-8">
        <div className="flex h-[52px] w-full max-w-4xl items-center justify-between rounded-2xl border border-zinc-200/80 bg-white px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 focus-within:border-zinc-300 focus-within:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
          <div className="flex items-center gap-3 text-zinc-400">
            <Search className="h-[18px] w-[18px]" />
            <input
              className="w-[520px] bg-transparent text-sm outline-none placeholder:text-zinc-400"
              placeholder="Global search... (e.g. passport, car insurance, Japan trip)"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500">
            <Command className="h-3 w-3" />
            K
          </div>
        </div>

        <div className="ml-6 flex items-center gap-3">
          <NotificationBell notifications={notifications} initialUnreadCount={unreadCount} />

          <button className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md">
            <User className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
