import { createHash } from 'crypto';

import type { UserService } from '@/services/user/UserService';
import type { LLMService } from '@/services/search/LLMService/LLMService';
import type { CachedYEService } from '@/services/data/yandexEda/cachedYEService/CachedYEService';
import type { CacheService } from '@/services/data/cache/cacheService/CacheService';
import type { TYEMenuItem, TYERestaurant } from '@/models/yandexEda';
import type { TSearchHistoryItem } from '@/models/user';
import type {
  TRankingCriteria,
  TSearchResult,
  TStructuredQuery,
} from '@/models/search';
import type { TMenuItem } from '@/models/menuItem';
import type { EAvailableCities } from '@/config/bot';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

import { SearchHistoryAnalyzer } from './SearchHistoryAnalyzer';
import { SearchFilterEngine } from './SearchFilterEngine';
import { ResultRanker } from './ResultRanker';

export interface TSearchService {
  searchFood(query: string, userId: number): Promise<TSearchResult[]>;
  processNaturalLanguageQuery(query: string, restaurantNames: string[]): Promise<TStructuredQuery>;
  filterByGeolocation(results: TSearchResult[], city: EAvailableCities): Promise<TSearchResult[]>;
  enhanceResultsWithLLM(results: TSearchResult[], originalQuery: string): Promise<TSearchResult[]>;
  getRankedResults(
    results: TSearchResult[],
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[]
  ): Promise<TSearchResult[]>;
  getSearchHistory(userId: number, limit?: number): Promise<TSearchHistoryItem[]>;
}

interface TSearchServiceConfig {
  maxResults?: number;
  cacheTTL?: {
    searchResults: number;
    queryTransformations: number;
    ranking: number;
    analytics: number;
    userPreferences: number;
  };
  ranking?: {
    queryMatchWeight: number;
    priceRelevanceWeight: number;
    userPreferenceWeight: number;
  };
  filtering?: {
    enableFuzzyMatching: boolean;
    strictExclusions: boolean;
    priceTolerancePercent: number;
    minimumMatchScore: number;
  };
  analytics?: {
    historyRetentionDays: number;
    minFrequencyThreshold: number;
  };
}

export class SearchService implements TSearchService {
  private readonly llmService: LLMService;
  private readonly userService: UserService;
  private readonly cachedYEService: CachedYEService;
  private readonly cacheService: CacheService;
  private readonly config: Required<TSearchServiceConfig>;
  private readonly resultRanker: ResultRanker;
  private readonly filterEngine: SearchFilterEngine;
  private readonly historyAnalyzer: SearchHistoryAnalyzer;

  constructor(
    llmService: LLMService,
    userService: UserService,
    cachedYEService: CachedYEService,
    cacheService: CacheService,
    config?: TSearchServiceConfig,
  ) {
    this.llmService = llmService;
    this.userService = userService;
    this.cachedYEService = cachedYEService;
    this.cacheService = cacheService;

    this.config = {
      maxResults: config?.maxResults ?? 30,
      cacheTTL: {
        searchResults: config?.cacheTTL?.searchResults ?? 1800, // 30 minutes
        queryTransformations: config?.cacheTTL?.queryTransformations ?? 3600, // 1 hour
        ranking: config?.cacheTTL?.ranking ?? 900, // 15 minutes
        analytics: config?.cacheTTL?.analytics ?? 7200, // 2 hours
        userPreferences: config?.cacheTTL?.userPreferences ?? 86400, // 24 hours
      },
      ranking: {
        queryMatchWeight: config?.ranking?.queryMatchWeight ?? 0.4,
        priceRelevanceWeight: config?.ranking?.priceRelevanceWeight ?? 0.25,
        userPreferenceWeight: config?.ranking?.userPreferenceWeight ?? 0.35,
      },
      filtering: {
        enableFuzzyMatching: config?.filtering?.enableFuzzyMatching ?? true,
        strictExclusions: config?.filtering?.strictExclusions ?? true,
        priceTolerancePercent: config?.filtering?.priceTolerancePercent ?? 10,
        minimumMatchScore: config?.filtering?.minimumMatchScore ?? 0.1,
      },
      analytics: {
        historyRetentionDays: config?.analytics?.historyRetentionDays ?? 90,
        minFrequencyThreshold: config?.analytics?.minFrequencyThreshold ?? 2,
      },
    };

    // Initialize components
    this.resultRanker = new ResultRanker({
      weights: {
        queryMatch: this.config.ranking.queryMatchWeight,
        priceRelevance: this.config.ranking.priceRelevanceWeight,
        userPreference: this.config.ranking.userPreferenceWeight,
      },
    });

    this.filterEngine = new SearchFilterEngine(this.config.filtering);
    this.historyAnalyzer = new SearchHistoryAnalyzer(this.config.analytics);
  }

  public async searchFood(query: string, userId: number): Promise<TSearchResult[]> {
    const startTime = Date.now();

    try {
      // 1. Validate user and get context
      const user = await this.userService.getUser(userId);
      if (!user) {
        throw AppError.userNotFound(userId);
      }

      // 2. Check cache first
      const cacheKey = this.generateCacheKey('search', query, user.city, userId);
      const cachedResults = await this.getFromCache<TSearchResult[]>(cacheKey);

      if (cachedResults) {
        logger.info('Найден кэшированный результат поиска', {
          userId,
          query,
          resultsCount: cachedResults.length,
        });
        return cachedResults;
      }

      // 3. Get available restaurants for query transformation
      const restaurants = await this.getAvailableRestaurants(user.city);
      const restaurantNames = restaurants.map(r => r.name);

      // 4. Transform natural language query
      const structuredQuery = await this.processNaturalLanguageQuery(query, restaurantNames);

      // 5. Search menu items
      const menuItems = await this.cachedYEService.searchItems(structuredQuery, user.city);

      // 6. Convert to search results format
      const searchResults = this.convertMenuItemsToSearchResults(menuItems);

      // 8. Apply advanced filtering with statistics
      const { filteredResults, stats: filterStats } = this.filterEngine.applySearchResultFilters(
        searchResults,
        structuredQuery,
        user.city,
      );

      logger.debug('Фильтрация завершена', {
        originalCount: searchResults.length,
        filteredCount: filteredResults.length,
        filterStats,
      });

      // 8. Get user search history for ranking
      const userHistory = await this.userService.getSearchHistory(userId, 10);

      // 9. Rank results using advanced ranking algorithm
      const rankedResults = this.resultRanker.rankResults(filteredResults, structuredQuery, userHistory);

      // 10. Enhance with LLM for better relevance
      const enhancedResults = await this.enhanceResultsWithLLM(rankedResults, query);

      // 11. Limit to configured max results
      const finalResults = enhancedResults.slice(0, this.config.maxResults);

      // 12. Cache results
      await this.setCache(cacheKey, finalResults, this.config.cacheTTL.searchResults);

      // 13. Save to search history
      const responseTime = Date.now() - startTime;
      await this.saveToSearchHistory(userId, query, structuredQuery, finalResults, responseTime, true);

      logger.info('Поиск выполнен успешно', {
        userId,
        query,
        resultsCount: finalResults.length,
        responseTime,
      });

      return finalResults;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Save failed search to history
      await this.saveToSearchHistory(userId, query, {}, [], responseTime, false);

      logger.error('Ошибка поиска', error as Error, { userId, query, responseTime });
      throw error;
    }
  }

  public async processNaturalLanguageQuery(query: string, restaurantNames: string[]): Promise<TStructuredQuery> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey('transform', query, restaurantNames.join(','));
      const cachedQuery = await this.getFromCache<TStructuredQuery>(cacheKey);

      if (cachedQuery) {
        logger.debug('Найден кэшированный результат трансформации запроса', { query });
        return cachedQuery;
      }

      // Transform via LLM
      const structuredQuery = await this.llmService.transformQuery(query, restaurantNames);

      // Cache result
      await this.setCache(cacheKey, structuredQuery, this.config.cacheTTL.queryTransformations);

      return structuredQuery;
    } catch (error) {
      logger.error('Ошибка трансформации запроса', error as Error, { query });
      throw AppError.llmError('Не удалось обработать запрос', { originalError: error });
    }
  }

  public async filterByGeolocation(results: TSearchResult[], city: EAvailableCities): Promise<TSearchResult[]> {
    // For now, results are already filtered by city during the search process
    // This method is prepared for future geolocation filtering enhancements
    return results.filter(result => {
      // Basic availability check - can be enhanced with delivery radius in the future
      return result.orderUrl && result.price > 0;
    });
  }

  public async enhanceResultsWithLLM(results: TSearchResult[], originalQuery: string): Promise<TSearchResult[]> {
    try {
      if (results.length === 0) return results;

      // Check cache first
      const cacheKey = this.generateCacheKey('enhance', originalQuery, results.length.toString());
      const cachedResults = await this.getFromCache<TSearchResult[]>(cacheKey);

      if (cachedResults) {
        logger.debug('Найден кэшированный результат улучшения', { query: originalQuery });
        return cachedResults;
      }

      const enhancedResults = await this.llmService.enhanceSearchResults(results, originalQuery);

      // Cache result
      await this.setCache(cacheKey, enhancedResults, this.config.cacheTTL.ranking);

      return enhancedResults;
    } catch (error) {
      logger.warn('Не удалось улучшить результаты через LLM, возвращаю оригинальные', error as Error);
      return results; // Fallback to original results
    }
  }

  public async getRankedResults(
    results: TSearchResult[],
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[],
  ): Promise<TSearchResult[]> {
    if (results.length === 0) return results;

    try {
      const rankedResults = results.map(result => ({
        ...result,
        rankingScore: this.calculateRankingScore(result, query, userHistory),
      }));

      return rankedResults.sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
    } catch (error) {
      logger.warn('Ошибка ранжирования результатов, возвращаю исходный порядок', error as Error);
      return results;
    }
  }

  public async getSearchHistory(userId: number, limit?: number): Promise<TSearchHistoryItem[]> {
    try {
      return await this.userService.getSearchHistory(userId, limit);
    } catch (error) {
      logger.error('Ошибка получения истории поиска', error as Error, { userId });
      throw AppError.systemError('SEARCH_HISTORY_GET_FAILED', 'Не удалось получить историю поиска');
    }
  }

  // Advanced analytics methods

  public async getSearchAnalytics(userId: number) {
    try {
      const cacheKey = this.generateCacheKey('analytics', userId);
      const cachedAnalytics = await this.getFromCache(cacheKey);

      if (cachedAnalytics) {
        return cachedAnalytics;
      }

      const history = await this.userService.getSearchHistory(userId, 100);
      const analytics = this.historyAnalyzer.analyzeUserSearchHistory(history);

      await this.setCache(cacheKey, analytics, this.config.cacheTTL.analytics);

      return analytics;
    } catch (error) {
      logger.error('Ошибка получения аналитики поиска', error as Error, { userId });
      throw AppError.systemError('SEARCH_ANALYTICS_FAILED', 'Не удалось получить аналитику поиска');
    }
  }

  public async getPersonalizedRecommendations(userId: number) {
    try {
      const cacheKey = this.generateCacheKey('recommendations', userId);
      const cachedRecommendations = await this.getFromCache(cacheKey);

      if (cachedRecommendations) {
        return cachedRecommendations;
      }

      const history = await this.userService.getSearchHistory(userId, 50);
      const recommendations = this.historyAnalyzer.getPersonalizedRecommendations(history);

      await this.setCache(cacheKey, recommendations, this.config.cacheTTL.userPreferences);

      return recommendations;
    } catch (error) {
      logger.error('Ошибка получения персонализированных рекомендаций', error as Error, { userId });
      return { recommendedQueries: [], recommendedRestaurants: [], recommendedPriceRange: null };
    }
  }

  // Private helper methods

  private async getAvailableRestaurants(city: EAvailableCities): Promise<TYERestaurant[]> {
    try {
      return await this.cachedYEService.getRestaurants(city);
    } catch (error) {
      logger.error('Ошибка получения списка ресторанов', error as Error, { city });
      throw AppError.dataCollectionError(`Не удалось получить список ресторанов для ${city}`);
    }
  }

  private convertMenuItemsToSearchResults(menuItems: TMenuItem[]): TSearchResult[] {
    return menuItems.map(item => ({
      id: item.id,
      name: item.name,
      restaurant: {
        id: item.restaurant.id,
        name: item.restaurant.name,
      },
      description: item.description,
      tags: item.ingredients, // Using ingredients as tags for now
      price: item.price,
      image: item.image,
      orderUrl: this.generateOrderUrl(item),
    }));
  }

  private generateOrderUrl(item: TMenuItem): string {
    // Generate Yandex.Eda order URL based on restaurant and item
    const baseUrl = 'https://eda.yandex.ru';
    const restaurantSlug = item.restaurant.additionalInfo?.brandSlug || item.restaurant.id;
    return `${baseUrl}/r/${restaurantSlug}?utm_source=food-talker`;
  }

  private calculateRankingScore(
    result: TSearchResult,
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[],
  ): number {
    const criteria = this.calculateRankingCriteria(result, query, userHistory);

    return (
      criteria.queryMatchScore * this.config.ranking.queryMatchWeight
      + criteria.priceRelevance * this.config.ranking.priceRelevanceWeight
      + criteria.userPreference * this.config.ranking.userPreferenceWeight
    );
  }

  private calculateRankingCriteria(
    result: TSearchResult,
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[],
  ): TRankingCriteria {
    return {
      queryMatchScore: this.calculateQueryMatchScore(result, query),
      priceRelevance: this.calculatePriceRelevance(result, query),
      userPreference: this.calculateUserPreference(result, userHistory),
    };
  }

  private calculateQueryMatchScore(result: TSearchResult, query: TStructuredQuery): number {
    let score = 0;

    // Tag matching (60% of query match score)
    if (query.tags && query.tags.length > 0) {
      const matchingTags = result.tags.filter(tag =>
        query.tags!.some(queryTag =>
          tag.toLowerCase().includes(queryTag.toLowerCase())
          || result.name.toLowerCase().includes(queryTag.toLowerCase())
          || result.description.toLowerCase().includes(queryTag.toLowerCase()),
        ),
      );
      score += (matchingTags.length / query.tags.length) * 0.6;
    }

    // Restaurant matching (40% of query match score)
    if (query.restaurants && query.restaurants.length > 0) {
      const restaurantMatch = query.restaurants.some(restaurant =>
        result.restaurant.name.toLowerCase().includes(restaurant.toLowerCase()),
      );
      score += restaurantMatch ? 0.4 : 0;
    }

    return Math.min(score, 1.0);
  }

  private calculatePriceRelevance(result: TSearchResult, query: TStructuredQuery): number {
    if (!query.priceRange) return 0.5; // Neutral score if no price preference

    const { min, max } = query.priceRange;
    const price = result.price;

    if (price >= min && price <= max) {
      // Perfect match within range
      return 1.0;
    } else if (price < min) {
      // Below minimum - score based on distance from min
      const distance = (min - price) / min;
      return Math.max(0, 1 - distance);
    } else {
      // Above maximum - score based on distance from max
      const distance = (price - max) / max;
      return Math.max(0, 1 - distance * 0.5); // Less penalty for being above range
    }
  }

  private calculateUserPreference(result: TSearchResult, userHistory?: TSearchHistoryItem[]): number {
    if (!userHistory || userHistory.length === 0) return 0.5; // Neutral score

    let preferenceScore = 0;
    const totalWeight = userHistory.length;

    userHistory.forEach((historyItem, index) => {
      const recencyWeight = (userHistory.length - index) / userHistory.length; // More recent = higher weight

      // Check restaurant preference
      const restaurantMatch = historyItem.results.some(prevResult =>
        prevResult.restaurant.id === result.restaurant.id,
      );
      if (restaurantMatch) {
        preferenceScore += 0.4 * recencyWeight;
      }

      // Check tag similarity
      if (historyItem.structuredQuery.tags) {
        const tagMatches = result.tags.filter(tag =>
          historyItem.structuredQuery.tags!.some(historyTag =>
            tag.toLowerCase().includes(historyTag.toLowerCase()),
          ),
        );
        if (tagMatches.length > 0) {
          preferenceScore += (0.6 * tagMatches.length / result.tags.length) * recencyWeight;
        }
      }
    });

    return Math.min(preferenceScore / totalWeight, 1.0);
  }

  private async saveToSearchHistory(
    userId: number,
    query: string,
    structuredQuery: TStructuredQuery,
    results: TSearchResult[],
    responseTime: number,
    success: boolean,
  ): Promise<void> {
    try {
      if (success && results.length > 0) {
        // Only save successful searches with results to avoid cluttering history
        await this.userService.addToSearchHistory(userId, query, structuredQuery, results);
      }
    } catch (error) {
      // Don't fail the search if history saving fails
      logger.warn('Не удалось сохранить запрос в историю', error as Error, { userId, query });
    }
  }

  // Cache helper methods with enhanced functionality

  private generateCacheKey(type: string, ...params: unknown[]): string {
    const data = JSON.stringify({ type, params });
    return `search:${createHash('sha256').update(data).digest('hex').substring(0, 16)}`;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const result = await this.cacheService.get<T>(key);
      if (result) {
        logger.debug('Кэш попадание', { key });
      }
      return result;
    } catch (error) {
      logger.warn('Ошибка получения из кэша поиска', { key, error: error as Error });
      return null;
    }
  }

  private async setCache<T>(key: string, value: T, ttl: number, metadata?: any): Promise<void> {
    try {
      await this.cacheService.set(key, value, ttl);
      logger.debug('Результат поиска сохранен в кэш', { key, ttl, metadata });
    } catch (error) {
      logger.warn('Ошибка сохранения в кэш поиска', { key, error: error as Error });
    }
  }

  // Cache management methods

  public async invalidateUserCache(userId: number): Promise<void> {
    try {
      const patterns = [
        this.generateCacheKey('search', '*', userId),
        this.generateCacheKey('analytics', userId),
        this.generateCacheKey('recommendations', userId),
        this.generateCacheKey('user_preferences', userId),
      ];

      // Since we can't use wildcards with current cache service, we'll clear specific keys
      // In a production environment, you'd want a cache service that supports pattern matching
      for (const pattern of patterns) {
        try {
          await this.cacheService.delete(pattern);
        } catch (error) {
          // Continue with other patterns if one fails
          logger.debug('Не удалось удалить ключ кэша', { pattern });
        }
      }

      logger.info('Кэш пользователя очищен', { userId });
    } catch (error) {
      logger.error('Ошибка очистки кэша пользователя', error as Error, { userId });
    }
  }

  public async getCacheStats(): Promise<any> {
    try {
      return await this.cacheService.getStats();
    } catch (error) {
      logger.error('Ошибка получения статистики кэша', error as Error);
      return null;
    }
  }
}
