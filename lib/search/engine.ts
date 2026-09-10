import { searchProviders } from "./providers";
import { rankSearchEntries } from "./rank";
import type { SearchEntry } from "./types";

/**
 * Every provider narrows its own read to rows that could plausibly match
 * `query` before this ever sees them (lib/search/providers.ts), so this
 * fetches nothing at all for an empty query and never touches more than a
 * bounded candidate set per table for a real one -- unlike the index this
 * replaced, which read every linkable row in the account on every page
 * load, whether or not search was ever used that visit.
 */
export async function searchGlobalIndex(query: string, limit = 10): Promise<SearchEntry[]> {
  if (!query.trim()) return [];
  const groups = await Promise.all(searchProviders.map((provider) => provider.getEntries(query)));
  return rankSearchEntries(groups.flat(), query, limit);
}
