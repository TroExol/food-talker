import { createHash } from 'crypto';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { TMenuItem } from '@/types/menuItem';
import type { UserService } from '@/services/user/UserService';
import type { LLMService } from '@/services/search/LLMService/LLMService';
import type { CachedYEService } from '@/services/platforms/yandexEda/cachedYEService/CachedYEService';
import type { CacheService } from '@/services/cacheService/CacheService';
import type { EAvailableCities } from '@/config/bot';

import { validator } from '@/utils/validation';
import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

interface TSearchService {
  searchFood(
    query: string,
    telegramId: number,
    options?: {
      maxResults?: number;
      includeUnavailable?: boolean;
    }
  ): Promise<TSearchResultItem[]>;
  processNaturalLanguageQuery(query: string, availableRestaurants: string[]): Promise<TStructuredQuery>;
  enhanceResultsWithLLM(results: TSearchResultItem[], originalQuery: string): Promise<TSearchResultItem[]>;
  getSearchStats(telegramId: number): Promise<{
    totalSearches: number;
    averageResults: number;
    lastSearchDate: Date | null;
  }>;
}

interface TSearchOptions {
  maxResults?: number;
  enableLLMEnhancement?: boolean;
}

interface TSearchContext {
  originalQuery: string;
  telegramId: number;
  userCity: EAvailableCities;
  availableRestaurants: string[];
}

export class SearchService implements TSearchService {
  private readonly defaultMaxResults = 20;
  private readonly searchCacheTTL = 1800; // 30 минут

  constructor(
    private readonly llmService: LLMService,
    private readonly cachedYEService: CachedYEService,
    private readonly userService: UserService,
    private readonly cacheService: CacheService,
  ) {
  }

  public searchFood = async (
    query: string,
    telegramId: number,
    options: TSearchOptions = {},
  ): Promise<TSearchResultItem[]> => {
    const startTime = Date.now();

    try {
      logger.info('Начинаем поиск еды', { query, telegramId, options });

      // 1. Валидация входных данных
      this.validateSearchInput(query, telegramId);

      // 2. Получение пользователя и его города
      const user = await this.getUserWithValidation(telegramId);
      const searchContext: TSearchContext = {
        originalQuery: query,
        telegramId,
        userCity: user.city,
        availableRestaurants: [],
      };

      // 3. Получение доступных ресторанов
      const activeRestaurants = await this.getRestaurants(user.city);
      searchContext.availableRestaurants = activeRestaurants.map(r => r.name);

      // 4. Преобразование естественного запроса в структурированный
      const structuredQuery = await this.processNaturalLanguageQuery(query, searchContext.availableRestaurants);

      // 5. Поиск в источниках данных
      const searchResults = await this.performSearch(structuredQuery, user.city, options);

      // 6. Улучшение результатов через LLM (опционально)
      const enhancedResults = options.enableLLMEnhancement !== false
        ? await this.enhanceResultsWithLLM(searchResults, query)
        : searchResults;

      // 7. Ограничение количества результатов
      const finalResults = this.limitResults(enhancedResults, options.maxResults || this.defaultMaxResults);

      // 8. Сохранение в историю поиска
      await this.saveSearchHistory(telegramId, query, structuredQuery, finalResults);

      // 9. Кэширование результатов
      await this.cacheSearchResults(query, user.city, finalResults);

      const duration = Date.now() - startTime;
      logger.info('Поиск еды завершен', {
        query,
        telegramId,
        resultsCount: finalResults.length,
        duration,
        city: user.city,
      });

      return finalResults;
    } catch (error) {
      logger.error('Ошибка поиска еды', error as Error, { query, telegramId });
      throw this.handleSearchError(error, query);
    }
  };

  private getRestaurants = async (city: EAvailableCities) => {
    try {
      const restaurants = await this.cachedYEService.getRestaurants(city);
      return restaurants;
    } catch (error) {
      logger.error('Не удалось получить список ресторанов', error as Error, { city });
      throw AppError.apiError(`Не удалось получить рестораны для города ${city}`, error);
    }
  };

  public processNaturalLanguageQuery = async (
    query: string,
    availableRestaurants: string[],
  ): Promise<TStructuredQuery> => {
    try {
      // Преобразуем через LLM
      const structuredQuery = await this.llmService.transformQuery(query, availableRestaurants);
      return structuredQuery;
    } catch (error) {
      logger.warn('Не удалось преобразовать запрос через LLM, используем базовый поиск', error as Error);
      return this.createFallbackQuery(query);
    }
  };

  private performSearch = async (
    structuredQuery: TStructuredQuery,
    city: EAvailableCities,
    options: TSearchOptions,
  ): Promise<TSearchResultItem[]> => {
    try {
      // Проверяем кэш результатов поиска
      const cacheKey = this.generateSearchCacheKey(structuredQuery, city);
      const cached = await this.cacheService.get<TSearchResultItem[]>(cacheKey);

      if (cached) {
        logger.debug('Найдены кэшированные результаты поиска', { city, cacheKey });
        return this.applyOptionsToResults(cached, options);
      }

      // Выполняем поиск через CachedYEService
      const menuItems = await this.cachedYEService.searchMenuItems(structuredQuery, city);

      // Преобразуем в формат TSearchResult
      const searchResults = this.transformMenuItemsToSearchResults(menuItems);

      // Кэшируем результаты
      await this.cacheService.set(cacheKey, searchResults, this.searchCacheTTL);

      return this.applyOptionsToResults(searchResults, options);
    } catch (error) {
      logger.error('Ошибка выполнения поиска', error as Error, { structuredQuery, city });
      throw AppError.apiError('Не удалось выполнить поиск', error);
    }
  };

  public enhanceResultsWithLLM = async (
    results: TSearchResultItem[],
    originalQuery: string,
  ): Promise<TSearchResultItem[]> => {
    if (results.length === 0) return results;

    try {
      return await this.llmService.enhanceSearchResults(results, originalQuery);
    } catch (error) {
      logger.warn('Не удалось улучшить результаты через LLM', error as Error);
      return results; // Fallback к оригинальным результатам
    }
  };

  private limitResults = (results: TSearchResultItem[], maxResults: number): TSearchResultItem[] => {
    if (results.length <= maxResults) return results;

    const limited = results.slice(0, maxResults);
    logger.debug('Результаты ограничены по количеству', {
      originalCount: results.length,
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
      logger.error('Ошибка получения статистики поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_STATS_FAILED', 'Не удалось получить статистику поиска');
    }
  };

  private validateSearchInput = (query: string, telegramId: number): void => {
    const queryValidation = validator.validateSearchQuery(query);
    if (!queryValidation.isValid) {
      throw AppError.validationError('INVALID_SEARCH_QUERY', queryValidation.errors[0]);
    }

    const telegramIdValidation = validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }
  };

  private getUserWithValidation = async (telegramId: number) => {
    const user = await this.userService.getUser(telegramId);
    if (!user) {
      throw AppError.userNotFound(telegramId);
    }
    return user;
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

  private applyOptionsToResults = (results: TSearchResultItem[], options: TSearchOptions): TSearchResultItem[] => {
    let filteredResults = results;

    // Ранжирование результатов
    filteredResults = this.rankSearchResults(filteredResults);

    // Ограничение количества
    if (options.maxResults && options.maxResults > 0) {
      filteredResults = filteredResults.slice(0, options.maxResults);
    }

    return filteredResults;
  };

  private rankSearchResults = (results: TSearchResultItem[]): TSearchResultItem[] => {
    // Простая логика ранжирования:
    // 1. По популярности ресторана (можно добавить позже)
    // 2. По рейтингу ресторана
    // 3. По цене (более доступные сначала)
    // 4. По наличию изображения

    return results.sort((a, b) => {
      // Наличие изображения
      if (a.image && !b.image) return -1;
      if (!a.image && b.image) return 1;

      // Цена (более дешевые сначала)
      if (a.price !== b.price) {
        return a.price - b.price;
      }

      // По названию для стабильности
      return a.name.localeCompare(b.name);
    });
  };

  private saveSearchHistory = async (
    telegramId: number,
    query: string,
    structuredQuery: TStructuredQuery,
    results: TSearchResultItem[],
  ): Promise<void> => {
    try {
      await this.userService.addToSearchHistory(telegramId, query, structuredQuery, results);
      logger.debug('История поиска сохранена', { telegramId, query });
    } catch (error) {
      logger.warn('Не удалось сохранить историю поиска', { error: error as Error, telegramId });
      // Не бросаем ошибку, чтобы не прерывать основной поток
    }
  };

  private cacheSearchResults = async (
    query: string,
    city: EAvailableCities,
    results: TSearchResultItem[],
  ): Promise<void> => {
    try {
      const cacheKey = this.generateFinalResultsCacheKey(query, city);
      await this.cacheService.set(cacheKey, results, this.searchCacheTTL);
    } catch (error) {
      logger.warn('Не удалось кэшировать результаты поиска', error as Error);
    }
  };

  private createFallbackQuery = (query: string): TStructuredQuery => {
    // Простая fallback логика для случаев когда LLM недоступен
    const tags: string[] = [];

    // Ищем ключевые слова в тексте запроса
    const queryLower = query.toLowerCase();

    if (queryLower.includes('пицца') || queryLower.includes('pizza')) tags.push('пицца');
    if (queryLower.includes('суши') || queryLower.includes('sushi')) tags.push('суши');
    if (queryLower.includes('бургер') || queryLower.includes('burger')) tags.push('бургер');
    if (queryLower.includes('шаурма') || queryLower.includes('shawarma')) tags.push('шаурма');
    if (queryLower.includes('салат') || queryLower.includes('salad')) tags.push('салат');
    if (queryLower.includes('суп') || queryLower.includes('soup')) tags.push('суп');
    if (queryLower.includes('паста') || queryLower.includes('pasta')) tags.push('паста');
    if (queryLower.includes('рыба') || queryLower.includes('fish')) tags.push('рыба');
    if (queryLower.includes('мясо') || queryLower.includes('meat')) tags.push('мясо');
    if (queryLower.includes('веган') || queryLower.includes('vegan')) tags.push('веган');
    if (queryLower.includes('остр') || queryLower.includes('spicy') || queryLower.includes('hot')) tags.push('острый');
    if (queryLower.includes('сладк') || queryLower.includes('sweet')) tags.push('сладкий');

    // Всегда возвращаем объект с tags, даже если массив пустой
    return { tags };
  };

  private generateSearchCacheKey = (structuredQuery: TStructuredQuery, city: EAvailableCities): string => {
    const data = JSON.stringify({
      structuredQuery,
      city,
    });
    return `search:results:${createHash('sha256').update(data).digest('hex')}`;
  };

  private generateFinalResultsCacheKey = (query: string, city: EAvailableCities): string => {
    const data = JSON.stringify({ query, city });
    return `search:final:${createHash('sha256').update(data).digest('hex')}`;
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
