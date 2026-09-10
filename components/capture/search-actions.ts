"use server";

import { searchGlobalIndex } from "@/lib/search/engine";
import type { SearchEntry } from "@/lib/search/types";

export async function searchAction(query: string): Promise<SearchEntry[]> {
  return searchGlobalIndex(query);
}
