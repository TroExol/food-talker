import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { EAvailableCities } from '@/config/bot/types';

import type {
  ESubscriptionType,
  TSearchHistoryItem,
  TUser,
} from '../UserRepository/types';

export interface TUserService {
  createUser(telegramId: number, chatId: number): Promise<TUser>;
  getUser(telegramId: number): Promise<TUser | null>;
  updateUserCity(telegramId: number, city: EAvailableCities): Promise<TUser>;
  updateSubscription(telegramId: number, subscription: ESubscriptionType): Promise<TUser>;
  checkSubscriptionExpiry(): Promise<TUser[]>;
  addToSearchHistory(
    telegramId: number,
    query: string,
    structuredQuery: TStructuredQuery,
    results: TSearchResultItem[],
  ): Promise<TSearchHistoryItem>;
  getSearchHistory(telegramId: number, limit?: number): Promise<TSearchHistoryItem[]>;
  clearSearchHistory(telegramId: number): Promise<void>;
  deleteUser(telegramId: number): Promise<boolean>;
}
