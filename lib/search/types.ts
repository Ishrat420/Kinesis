export type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  keywords: string[];
  kind: string;
  icon: "document" | "goal" | "finance" | "relationship" | "custom";
  iconName?: string;
};

export type RankedSearchResult = Omit<SearchResult, "keywords"> & { score: number };

export type SearchProvider = {
  id: string;
  search: (query: string) => Promise<SearchResult[]>;
};
