export function Topbar() {
  return (
    <header className="flex h-16 items-center justify-between border border-zinc-200/80-b bg-white px-6">
      <div className="text-lg font-bold">Kinesis</div>

      <div className="w-full max-w-3xl rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
        Search everything...
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