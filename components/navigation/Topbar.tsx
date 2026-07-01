import { Bell, Command, Search, User } from "lucide-react";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-full items-center justify-between px-8">
        {/* Search */}
        <div className="flex-1">
          <div className="flex h-12 max-w-3xl items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 shadow-sm">
            <div className="flex items-center gap-3 text-zinc-400">
              <Search className="h-5 w-5" />

              <span className="text-sm">
                Global search... (e.g. passport, car insurance, Japan trip)
              </span>
            </div>

            <div className="flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500">
              <Command className="h-3 w-3" />
              K
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="ml-6 flex items-center gap-3">
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition hover:bg-zinc-50">
            <Bell className="h-4 w-4" />
          </button>

          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition hover:bg-zinc-50">
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}