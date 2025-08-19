import type { EAvailableCities } from '@/config/bot';

import type { TSearchResult, TStructuredQuery } from './search';

export enum ESubscriptionType {
  BASIC = 'basic',
}

export interface TUser {
  telegramId: number;
  chatId: number;
  city: EAvailableCities;
  subscription: ESubscriptionType;
  subscriptionExpiry: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TUserEntity {
  telegram_id: number;
  chat_id: number;
  city: EAvailableCities;
  subscription_type: string;
  subscription_expiry: string; // ISO string
  created_at: string; // ISO string
  updated_at: string; // ISO string
}

export interface TSearchHistoryItem {
  id: string;
  query: string;
  structuredQuery: TStructuredQuery;
  results: TSearchResult[];
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
