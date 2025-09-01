import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { EAvailableCities } from '@/config/bot/types';

export enum ESubscriptionType {
  BASIC = 'basic',
}

export const SEARCH_LIMITS_PER_DAY = {
  [ESubscriptionType.BASIC]: 30,
} as const;

export interface TUser {
  telegramId: string;
  chatId: string;
  city: EAvailableCities;
  subscription: ESubscriptionType;
  subscriptionExpiry: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TUserEntity {
  telegram_id: string;
  chat_id: string;
  city: EAvailableCities;
  subscription_type: string;
  subscription_expiry: string | null; // ISO string
  created_at: string; // ISO string
  updated_at: string; // ISO string
}

export interface TSearchHistoryItem {
  id: string;
  query: string;
  structuredQuery: TStructuredQuery;
  results: TSearchResultItem[];
  timestamp: Date;
}

export interface TSearchHistoryEntity {
  id: string;
  user_telegram_id: string;
  query: string;
  structured_query: TStructuredQuery;
  results: TSearchResultItem[];
  created_at: string; // ISO string
}

export interface TSearchStats {
  totalSearches: number;
  searchesToday: number;
  searchesThisMonth: number;
  lastSearchDate: Date | null;
  searchLimit: number;
  remainingSearches: number;
}
