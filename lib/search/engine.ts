import { searchProviders } from "./providers";
import type { SearchEntry } from "./types";

export async function getGlobalSearchIndex(): Promise<SearchEntry[]> {
  const groups = await Promise.all(searchProviders.map((provider) => provider.getEntries()));
  return groups.flat();
}
