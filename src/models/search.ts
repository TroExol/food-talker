import type { EAvailableCities } from '@/config/bot';

interface TPriceRange {
  min: number;
  max: number;
}

export interface TStructuredQuery {
  restaurants?: string[];
  tags?: string[];
  priceRange?: TPriceRange;
  exclusions?: {
    restaurants?: string[];
    tags?: string[];
    priceRange?: TPriceRange;
  };
}

export interface TRestaurantInfo {
  id: string;
  name: string;
}

export interface TSearchResult {
  id: string;
  name: string;
  restaurant: TRestaurantInfo;
  description: string;
  tags: string[];
  price: number; // RUB
  image?: string;
  orderUrl: string;
  rankingScore?: number; // Calculated relevance score
}

export interface TRankingCriteria {
  queryMatchScore: number;
  priceRelevance: number;
  userPreference: number;
}

export interface TSearchFilters {
  // Basic filters from structured query
  restaurants?: string[];
  tags?: string[];
  priceRange?: TPriceRange;

  // Exclusion filters
  exclusions?: {
    restaurants?: string[];
    tags?: string[];
    priceRange?: TPriceRange;
  };

  // Location-based filters
  geolocation: {
    city: EAvailableCities;
    deliveryRadius: number;
  };
}

export interface TSearchHistoryMetrics {
  totalSearches: number;
  averageResponseTime: number;
  successRate: number;
  popularQueries: string[];
  popularRestaurants: string[];
}

export interface TSearchCacheStrategy {
  // Cache search results for identical queries
  searchResults: {
    ttl: number; // seconds
    keyPattern: string;
  };

  // Cache LLM query transformations
  queryTransformations: {
    ttl: number; // seconds
    keyPattern: string;
  };

  // Cache ranking calculations
  ranking: {
    ttl: number; // seconds
    keyPattern: string;
  };
}
