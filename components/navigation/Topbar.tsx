export function Topbar() {
  return (
    <header className="flex h-16 items-center justify-between border border-zinc-200/80-b bg-white px-6">
      <div className="text-lg font-bold">Kinesis</div>

      <div className="hidden w-full max-w-md rounded-full border border-zinc-200/80 bg-zinc-50 px-4 py-2 text-sm text-zinc-500 md:block">
        🔍 Search everything...
      </div>

      <div className="flex items-center gap-4">
        <button className="rounded-full border border-zinc-200/80 bg-white px-3 py-2 text-sm">
          🔔
        </button>
        <button className="rounded-full border border-zinc-200/80 bg-white px-3 py-2 text-sm">
          👤
        </button>
      </div>
    </header>
  );
}