import type { SearchEntry } from "./types";

export const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The exact term list `rankSearchEntries` matches against, exported so a
 * provider narrowing its own database read to candidate rows agrees with the
 * ranker on what "the terms" are -- rather than each side deriving its own
 * and risking the two disagreeing about what one word even means.
 */
export function searchTerms(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

export function rankSearchEntries(entries: SearchEntry[], query: string, limit = 10): SearchEntry[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];

  return entries.map((entry, order) => {
    const title = normalize(entry.title);
    const subtitle = normalize(entry.subtitle);
    const haystack = normalize([entry.title, entry.subtitle, ...entry.keywords].join(" "));
    if (!terms.every((term) => haystack.includes(term))) return null;
    const score = terms.reduce((total, term) => total + (title === term ? 100 : title.startsWith(term) ? 60 : title.includes(term) ? 35 : subtitle.includes(term) ? 15 : 5), 0);
    return { entry, score, order };
  }).filter((match): match is { entry: SearchEntry; score: number; order: number } => match !== null)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
