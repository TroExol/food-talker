import type { TSearchResultItem } from '@/types/search';

export interface TSearchService {
  searchFood(
    query: string,
    telegramId: number,
    options?: {
      maxResults?: number;
      includeUnavailable?: boolean;
    }
  ): Promise<TSearchResultItem[]>;
  enhanceResultsWithLLM(results: TSearchResultItem[], originalQuery: string): Promise<TSearchResultItem[]>;
  getSearchStats(telegramId: number): Promise<{
    totalSearches: number;
    averageResults: number;
    lastSearchDate: Date | null;
  }>;
}

export interface TSearchOptions {
  maxResults?: number;
  enableLLMEnhancement?: boolean;
}
