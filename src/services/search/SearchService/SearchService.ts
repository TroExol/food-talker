import { createHash } from 'crypto';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { TRestaurant } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';
import type { UserService } from '@/services/user/UserService/UserService';
import type { VectorSearchService } from '@/services/search/VectorSearchService/VectorSearchService';
import type { YESearchService } from '@/services/platforms/yandexEda/yeSearchService/YESearchService';
import type { YEApiService } from '@/services/platforms/yandexEda/yeApiService/YEApiService';
import type { LLMService } from '@/services/LLMService/LLMService';
import type { CacheService } from '@/services/cacheService/CacheService';
import type { AnalyticsService } from '@/services/analytics/AnalyticsService/AnalyticsService';
import type { EAvailableCities } from '@/config/bot/types';

import { Validator } from '@/utils/Validator';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type { TSearchOptions } from './types';

export class SearchService {
  private readonly cacheTTL = 1800; // 30 минут

  constructor(
    private readonly llmService: LLMService,
    private readonly yeApiService: YEApiService,
    private readonly yeSearchService: YESearchService,
    private readonly userService: UserService,
    private readonly cacheService: CacheService,
    private readonly vectorSearchService: VectorSearchService,
    private readonly analyticsService: AnalyticsService,
  ) { }

  public searchFood = async (
    naturalQuery: string,
    telegramId: string,
    options: TSearchOptions = {
      enableVectorSearch: false,
    },
  ): Promise<TSearchResultItem[]> => {
    const startTime = Date.now();

    try {
      ConsoleLogger.info('Начинаем поиск еды', { query: naturalQuery, telegramId, options });

      // Валидация входных данных
      this.validateSearchInput(naturalQuery, telegramId);

      const user = await this.userService.getUser(telegramId);
      if (!user) {
        throw AppError.userNotFound(telegramId);
      }

      // Параллельно получаем рестораны и структурируем запрос через менеджер
      const restaurants = await this.getRestaurants(user.city);
      const structuredQuery = await this.llmService.stuctureQuery(naturalQuery, restaurants);

      // Используем векторный поиск вместо структурированного
      let results = options.enableVectorSearch
        ? options.searchIn === 'lightRAG'
          ? await this.searchWithLightRAG(user.city, naturalQuery, structuredQuery)
          : await this.searchWithRAG(user.city, naturalQuery, structuredQuery)
        : [];

      // Если векторный поиск не дал результатов, используем фильтрацию и ранжирование
      if (results.length === 0) {
        ConsoleLogger.info('Векторный поиск не дал результатов, используем традиционный поиск', {
          query: naturalQuery,
          structuredQuery,
        });
        results = await this.platformsSearch(structuredQuery, user.city);
      }

      // Ограничиваем количество результатов для LLM-обработки
      results = this.limitResults(results, options.maxEnhenceMenu || 100);

      results = options.enableLLMEnhancement
        ? await this.llmService.enhanceSearchResults(results, naturalQuery)
        : results;

      await this.saveSearchHistory(telegramId, naturalQuery, structuredQuery, results);

      const duration = Date.now() - startTime;
      ConsoleLogger.info('Поиск еды завершен', {
        query: naturalQuery,
        telegramId,
        resultsCount: results.length,
        duration,
        city: user.city,
      });

      // Отслеживаем производительность поиска
      this.analyticsService.trackPerformance({ operation: 'search_food', duration });

      return results;
    } catch (error) {
      // Отслеживаем ошибку поиска
      this.analyticsService.trackError({
        error: error as Error,
        context: {
          component: 'search_service',
          user_action: 'search_food',
          user_id: telegramId,
          query: naturalQuery,
        },
      });

      ConsoleLogger.error('Ошибка поиска еды', error as Error, { query: naturalQuery, telegramId });
      throw this.handleSearchError(error, naturalQuery);
    }
  };

  // Векторный поиск
  private searchWithRAG = async (
    city: EAvailableCities,
    naturalQuery: string,
    structuredQuery: TStructuredQuery,
  ): Promise<TSearchResultItem[]> => {
    try {
      const vectorResults = await this.vectorSearchService.searchMenuWithRAG(naturalQuery, {
        category: structuredQuery.category,
        restaurantNames: structuredQuery.restaurants,
        minPrice: structuredQuery.priceRange?.min,
        maxPrice: structuredQuery.priceRange?.max,
        limit: 200,
        minSimilarity: 0.3,
        city,
      });

      ConsoleLogger.info('Векторный поиск выполнен', {
        naturalQuery,
        structuredQuery,
        resultsCount: vectorResults.length,
        maxSimilarity: vectorResults[0]?.similarity,
      });

      return vectorResults;
    } catch (error) {
      ConsoleLogger.error('Ошибка векторного поиска', error as Error, { naturalQuery, structuredQuery });
      return []; // Возвращаем пустой массив для fallback к традиционному поиску
    }
  };

  // Векторный поиск
  private searchWithLightRAG = async (
    city: EAvailableCities,
    naturalQuery: string,
    structuredQuery: TStructuredQuery,
  ): Promise<TSearchResultItem[]> => {
    try {
      const vectorResults = await this.vectorSearchService.searchMenuWithLightRAG(naturalQuery, {
        category: structuredQuery.category,
        restaurantNames: structuredQuery.restaurants,
        minPrice: structuredQuery.priceRange?.min,
        maxPrice: structuredQuery.priceRange?.max,
        limit: 200,
        city,
      });

      ConsoleLogger.debug('Векторный поиск выполнен', {
        naturalQuery,
        structuredQuery,
        resultsCount: vectorResults.length,
      });

      return vectorResults;
    } catch (error) {
      ConsoleLogger.error('Ошибка векторного поиска', error as Error, { naturalQuery, structuredQuery });
      return []; // Возвращаем пустой массив для fallback к традиционному поиску
    }
  };

  // Получаем список ресторанов из разных платформ
  private getRestaurants = async (city: EAvailableCities) => {
    try {
      const restaurants: TRestaurant[] = await this.yeApiService.getRestaurants(city);
      return restaurants;
    } catch (error) {
      ConsoleLogger.error('Не удалось получить список ресторанов', error as Error, { city });
      throw AppError.apiError(`Не удалось получить рестораны для города ${city}`, error);
    }
  };

  // Поиск в разных платформах
  private platformsSearch = async (
    structuredQuery: TStructuredQuery,
    city: EAvailableCities,
  ): Promise<TSearchResultItem[]> => {
    try {
      const cacheKey = this.generateSearchCacheKey(structuredQuery, city);
      const cached = await this.cacheService.get<TSearchResultItem[]>(cacheKey);

      if (cached) {
        ConsoleLogger.debug('Найдены кэшированные результаты поиска', { city, cacheKey });
        return cached;
      }

      // Список блюд из разных платформ
      const menuItems: TMenuItem[] = await this.yeSearchService.searchMenu(structuredQuery, city);

      const searchResults = this.transformMenuItemsToSearchResults(menuItems);

      await this.cacheService.set(cacheKey, searchResults, this.cacheTTL);

      return searchResults;
    } catch (error) {
      ConsoleLogger.error('Ошибка выполнения поиска', error as Error, { structuredQuery, city });
      throw AppError.apiError('Не удалось выполнить поиск', error);
    }
  };

  private limitResults = (searchResults: TSearchResultItem[], maxResults: number): TSearchResultItem[] => {
    if (searchResults.length <= maxResults) return searchResults;

    const limited = searchResults.slice(0, maxResults);
    ConsoleLogger.info('Результаты ограничены по количеству', {
      originalCount: searchResults.length,
      limitedCount: limited.length,
    });

    return limited;
  };

  public getSearchStats = async (telegramId: string): Promise<{
    totalSearches: number;
    averageResults: number;
    lastSearchDate: Date | null;
  }> => {
    try {
      const history = await this.userService.getSearchHistory(telegramId, 100); // Получаем последние 100 запросов

      if (history.length === 0) {
        return {
          totalSearches: 0,
          averageResults: 0,
          lastSearchDate: null,
        };
      }

      const totalResults = history.reduce((sum, item) => sum + item.results.length, 0);
      const lastSearch = history.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0];

      return {
        totalSearches: history.length,
        averageResults: Math.round(totalResults / history.length),
        lastSearchDate: lastSearch.timestamp,
      };
    } catch (error) {
      ConsoleLogger.error('Ошибка получения статистики поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_STATS_FAILED', 'Не удалось получить статистику поиска');
    }
  };

  private validateSearchInput = (query: string, telegramId: string): void => {
    const queryValidation = Validator.validateSearchQuery(query);
    if (!queryValidation.isValid) {
      throw AppError.validationError('INVALID_SEARCH_QUERY', queryValidation.errors[0]);
    }

    const telegramIdValidation = Validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }
  };

  private transformMenuItemsToSearchResults = (menuItems: TMenuItem[]): TSearchResultItem[] => {
    return menuItems.map((item, index): TSearchResultItem => ({
      id: item.id || `search_${index}_${Date.now()}`,
      name: item.name,
      category: item.category,
      restaurant: {
        id: item.restaurant.id,
        name: item.restaurant.name,
      },
      description: item.description,
      tags: item.ingredients,
      price: item.price,
      image: item.image,
      orderUrl: item.orderUrl,
      available: item.available,
    }));
  };

  private saveSearchHistory = async (
    telegramId: string,
    query: string,
    structuredQuery: TStructuredQuery,
    results: TSearchResultItem[],
  ): Promise<void> => {
    try {
      await this.userService.addToSearchHistory(telegramId, query, structuredQuery, results);
      ConsoleLogger.debug('История поиска сохранена', { telegramId, query });
    } catch (error) {
      ConsoleLogger.warn('Не удалось сохранить историю поиска', { error: error as Error, telegramId });
      // Не бросаем ошибку, чтобы не прерывать основной поток
    }
  };

  private generateSearchCacheKey = (structuredQuery: TStructuredQuery, city: EAvailableCities): string => {
    const data = JSON.stringify({
      structuredQuery,
      city,
    });
    return `search:results:${createHash('sha256').update(data).digest('hex')}`;
  };

  private handleSearchError = (error: unknown, query: string): AppError => {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return AppError.apiError('SEARCH_TIMEOUT', 'Превышено время ожидания поиска');
      }
      if (error.message.includes('rate limit')) {
        return AppError.rateLimitError('SEARCH_RATE_LIMIT', 'Превышен лимит запросов');
      }
    }

    return AppError.systemError('SEARCH_FAILED', `Поиск по запросу "${query}" не удался`);
  };
}
