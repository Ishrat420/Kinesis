import { coreSearchProviders } from "./providers";
import type { RankedSearchResult, SearchProvider, SearchResult } from "./types";

const normalize = (value: string) => value.normalize("NFKD").toLocaleLowerCase().replace(/\p{Diacritic}/gu, "").trim();

function scoreResult(result: SearchResult, query: string) {
  const title = normalize(result.title);
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const fields = result.keywords.map(normalize);
  if (!terms.every((term) => fields.some((field) => field.includes(term)))) return 0;
  return terms.reduce((score, term) => score + (title === term ? 100 : title.startsWith(term) ? 50 : title.includes(term) ? 25 : 5), 0);
}

export async function search(query: string, options: { limit?: number; providers?: SearchProvider[] } = {}): Promise<RankedSearchResult[]> {
  const cleanQuery = query.trim().slice(0, 100);
  if (!cleanQuery) return [];
  const providerResults = await Promise.all((options.providers ?? coreSearchProviders).map((provider) => provider.search(cleanQuery)));
  return providerResults.flat().map((result) => ({ ...result, score: scoreResult(result, cleanQuery) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, options.limit ?? 12).map((ranked) => { const { keywords, ...result } = ranked; void keywords; return result; });
}
