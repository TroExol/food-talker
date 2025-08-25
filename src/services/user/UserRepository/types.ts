import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { EAvailableCities } from '@/config/bot/types';

export enum ESubscriptionType {
  BASIC = 'basic',
}

export interface TUser {
  telegramId: number;
  chatId: number;
  city: EAvailableCities;
  subscription: ESubscriptionType;
  subscriptionExpiry: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TUserEntity {
  telegram_id: number;
  chat_id: number;
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
  resultsCount: number;
  timestamp: Date;
}

export interface TSearchHistoryEntity {
  id: string;
  user_telegram_id: number;
  query: string;
  structured_query: string; // JSON string
  results_count: number;
  created_at: string; // ISO string
}
