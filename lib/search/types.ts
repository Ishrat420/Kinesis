export type SearchResultKind = "Document" | "Goal" | "Finance" | "Relationship" | "Custom" | "Todo";

export type SearchEntry = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  kind: SearchResultKind;
  /** Human-readable values that should be discoverable but need not be displayed. */
  keywords: string[];
  /** Custom modules use their configured icon and colour. */
  icon?: string;
  color?: string;
};

export type SearchProvider = {
  id: string;
  /** Empty terms (nothing typed yet) always returns []: nothing runs speculatively. */
  getEntries: (query: string) => Promise<SearchEntry[]>;
};
