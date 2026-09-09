/**
 * Shown the instant a switch to this tab starts, before the page's data has
 * come back -- the route transition itself is immediate either way, but
 * without this the screen sits frozen on the old tab until the fetch
 * resolves, which is what reads as "slow" even when the query itself is
 * fast. A skeleton roughly matching this tab's shape keeps the switch
 * feeling instant.
 */
export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-24 rounded-3xl bg-zinc-100" />
      <div className="h-40 rounded-3xl bg-zinc-100" />
      <div className="h-32 rounded-3xl bg-zinc-100" />
    </div>
  );
}
