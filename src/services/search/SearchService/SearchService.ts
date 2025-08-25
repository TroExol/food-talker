import { createHash } from 'crypto';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { TRestaurant } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';
import type { UserService } from '@/services/user/UserService/UserService';
import type { LLMService } from '@/services/search/LLMService/LLMService';
import type { YESearchService } from '@/services/platforms/yandexEda/yeSearchService/YESearchService';
import type { YEApiService } from '@/services/platforms/yandexEda/yeApiService/YEApiService';
import type { CacheService } from '@/services/cacheService/CacheService';
import type { EAvailableCities } from '@/config/bot/types';

import { Validator } from '@/utils/Validator';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type { TSearchOptions } from './types';

import { AsyncRequestManager } from './AsyncRequestManager';

export class SearchService {
  private readonly cacheTTL = 1800; // 30 минут
  private readonly asyncRequestManager: AsyncRequestManager;

  constructor(
    private readonly llmService: LLMService,
    private readonly yeApiService: YEApiService,
    private readonly yeSearchService: YESearchService,
    private readonly userService: UserService,
    private readonly cacheService: CacheService,
  ) {
    this.asyncRequestManager = new AsyncRequestManager(3); // Максимум 3 одновременных запроса
  }

  public searchFood = async (
    naturalQuery: string,
    telegramId: number,
    options: TSearchOptions = {},
  ): Promise<TSearchResultItem[]> => {
    const startTime = Date.now();
    const requestId = `search_${telegramId}_${Date.now()}`;

    try {
      ConsoleLogger.info('Начинаем поиск еды', { query: naturalQuery, telegramId, options, requestId });

      // Валидация входных данных
      this.validateSearchInput(naturalQuery, telegramId);

      const user = await this.userService.getUser(telegramId);
      if (!user) {
        throw AppError.userNotFound(telegramId);
      }

      // Параллельно получаем рестораны и структурируем запрос через менеджер
      const restaurants = await this.asyncRequestManager.executeRequest(
        `${requestId}_restaurants`,
        () => this.getRestaurants(user.city),
      );
      const structuredQuery = await this.asyncRequestManager.executeRequest(
        `${requestId}_structure`,
        () => this.llmService.stuctureQuery(naturalQuery, restaurants.map(restaurant => restaurant.name)),
      );

      // Получаем результаты поиска через менеджер
      const searchResults = await this.asyncRequestManager.executeRequest(
        `${requestId}_search`,
        () => this.platformsSearch(structuredQuery, user.city),
      );

      // Сначала сортируем по релевантности, затем применяем LLM-улучшение
      const rankedResults = this.rankSearchResults(searchResults);

      // Ограничиваем количество результатов для LLM-обработки
      const limitedResults = this.limitResults(rankedResults, options.maxEnhenceMenu || 40);

      const finalResults = options.enableLLMEnhancement
        ? await this.asyncRequestManager.executeRequest(
            `${requestId}_enhance`,
            () => this.enhanceResultsWithLLM(limitedResults, naturalQuery),
          )
        : rankedResults;

      // Сохраняем историю поиска асинхронно (не блокируем основной поток)
      this.saveSearchHistory(telegramId, naturalQuery, structuredQuery, finalResults).catch(error => {
        ConsoleLogger.warn('Не удалось сохранить историю поиска', { error: error as Error, telegramId });
      });

      const duration = Date.now() - startTime;
      ConsoleLogger.info('Поиск еды завершен', {
        query: naturalQuery,
        telegramId,
        resultsCount: finalResults.length,
        duration,
        city: user.city,
        requestId,
        stats: this.asyncRequestManager.getStats(),
      });

      return finalResults;
    } catch (error) {
      ConsoleLogger.error('Ошибка поиска еды', error as Error, { query: naturalQuery, telegramId, requestId });
      throw this.handleSearchError(error, naturalQuery);
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

  public enhanceResultsWithLLM = async (
    searchResults: TSearchResultItem[],
    originalQuery: string,
  ): Promise<TSearchResultItem[]> => {
    if (searchResults.length === 0) return searchResults;

    try {
      return await this.llmService.enhanceSearchResults(searchResults, originalQuery);
    } catch (error) {
      ConsoleLogger.warn('Не удалось улучшить результаты через LLM', error as Error);
      return searchResults; // Fallback к оригинальным результатам
    }
  };

  private rankSearchResults = (results: TSearchResultItem[]): TSearchResultItem[] => {
    // Улучшенная логика ранжирования с учетом релевантности запросу
    return results.sort((a, b) => {
      // Наличие изображения (базовый бонус)
      const imageScoreA = a.image ? 2 : 0;
      const imageScoreB = b.image ? 2 : 0;

      // Цена (более доступные получают небольшой бонус)
      const priceScoreA = Math.max(0, 1000 - a.price) / 100; // Бонус до 10 баллов
      const priceScoreB = Math.max(0, 1000 - b.price) / 100;

      // Общий счет
      const totalScoreA = imageScoreA + priceScoreA;
      const totalScoreB = imageScoreB + priceScoreB;

      if (totalScoreA !== totalScoreB) {
        return totalScoreB - totalScoreA;
      }

      // При равном счете - по названию для стабильности
      return a.name.localeCompare(b.name);
    });
  };

  private limitResults = (searchResults: TSearchResultItem[], maxResults: number): TSearchResultItem[] => {
    if (searchResults.length <= maxResults) return searchResults;

    const limited = searchResults.slice(0, maxResults);
    ConsoleLogger.debug('Результаты ограничены по количеству', {
      originalCount: searchResults.length,
      limitedCount: limited.length,
    });

    return limited;
  };

  public getSearchStats = async (telegramId: number): Promise<{
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

  private validateSearchInput = (query: string, telegramId: number): void => {
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
      restaurant: {
        id: item.restaurant.id,
        name: item.restaurant.name,
      },
      description: item.description,
      tags: item.ingredients,
      price: item.price,
      image: item.image,
      orderUrl: item.orderUrl,
    }));
  };

  private saveSearchHistory = async (
    telegramId: number,
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
