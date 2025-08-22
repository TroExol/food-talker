import type { Mock } from 'vitest';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { LLMService } from '@/services/search/LLMService/LLMService';
import type { UserService } from '@/services/user/UserService';
import type { CachedYEService } from '@/services/data/yandexEda/cachedYEService/CachedYEService';
import type { CacheService } from '@/services/data/cache/cacheService/CacheService';
import type { TSearchResult, TStructuredQuery } from '@/models/search';
import type { TSearchHistoryItem, TUser } from '@/models/user';
import type { TYEMenuItem, TYERestaurant } from '@/models/yandexEda';

import { EAvailableCities } from '@/config/bot';
import { ESubscriptionType } from '@/models/user';
import { AppError } from '@/utils/errors';

import { SearchService } from './SearchService';

describe('SearchService', () => {
  let searchService: SearchService;
  let mockLLMService: LLMService;
  let mockUserService: UserService;
  let mockCachedYEService: CachedYEService;
  let mockCacheService: CacheService;

  const mockUser: TUser = {
    telegramId: 123456,
    chatId: 123456,
    city: EAvailableCities.PERM,
    subscription: ESubscriptionType.BASIC,
    subscriptionExpiry: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRestaurant: TYERestaurant = {
    id: 'test-restaurant-1',
    name: 'Test Restaurant',
    coordinates: { latitude: 58.0105, longitude: 56.2502 },
    workingHours: { open: '09:00', close: '23:00', isOpen: true },
    isActive: true,
    lastUpdated: new Date(),
    additionalInfo: {
      brandSlug: 'test-restaurant'
    }
  };

  const mockMenuItem: TYEMenuItem = {
    id: 1,
    name: 'Тестовая пицца',
    description: 'Вкусная тестовая пицца с сыром',
    available: true,
    inStock: true,
    price: 500,
    decimalPrice: '500.00',
    promoTypes: [],
    optionsGroups: [],
    adult: false,
    shippingType: 'delivery',
    publicId: 'test-item-1',
    ingredients: ['тесто', 'сыр', 'томаты'],
    restaurant: mockRestaurant
  };

  const mockSearchResult: TSearchResult = {
    id: '1',
    name: 'Тестовая пицца',
    restaurant: {
      id: 'test-restaurant-1',
      name: 'Test Restaurant'
    },
    description: 'Вкусная тестовая пицца с сыром',
    tags: ['пицца', 'сыр'],
    price: 500,
    orderUrl: 'https://eda.yandex.ru/r/test-restaurant?utm_source=food-talker'
  };

  const mockStructuredQuery: TStructuredQuery = {
    tags: ['пицца'],
    priceRange: { min: 300, max: 800 }
  };

  const mockSearchHistory: TSearchHistoryItem = {
    id: 'history-1',
    query: 'пицца',
    structuredQuery: mockStructuredQuery,
    results: [mockSearchResult],
    timestamp: new Date()
  };

  beforeEach(() => {
    // Mock LLMService
    mockLLMService = {
      transformQuery: vi.fn(),
      enhanceSearchResults: vi.fn(),
    } as unknown as LLMService;

    // Mock UserService
    mockUserService = {
      getUser: vi.fn(),
      getSearchHistory: vi.fn(),
      addToSearchHistory: vi.fn(),
    } as unknown as UserService;

    // Mock CachedYEService
    mockCachedYEService = {
      getRestaurants: vi.fn(),
      searchItems: vi.fn(),
    } as unknown as CachedYEService;

    // Mock CacheService
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      getStats: vi.fn(),
      close: vi.fn(),
    } as unknown as CacheService;

    searchService = new SearchService(
      mockLLMService,
      mockUserService,
      mockCachedYEService,
      mockCacheService,
      {
        maxResults: 10,
        cacheTTL: {
          searchResults: 1800,
          queryTransformations: 3600,
          ranking: 900,
          analytics: 7200,
          userPreferences: 86400,
        }
      }
    );
  });

  describe('searchFood', () => {
    it('should successfully search and return results', async () => {
      // Setup mocks
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCacheService.get as Mock).mockResolvedValue(null); // No cache
      (mockCachedYEService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.transformQuery as Mock).mockResolvedValue(mockStructuredQuery);
      (mockCachedYEService.searchItems as Mock).mockResolvedValue([mockMenuItem]);
      (mockUserService.getSearchHistory as Mock).mockResolvedValue([mockSearchHistory]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(mockSearchHistory);

      const results = await searchService.searchFood('пицца', 123456);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        name: 'Тестовая пицца',
        price: 500,
        restaurant: { name: 'Test Restaurant' }
      });
      
      // Verify all services were called
      expect(mockUserService.getUser).toHaveBeenCalledWith(123456);
      expect(mockLLMService.transformQuery).toHaveBeenCalled();
      expect(mockCachedYEService.searchItems).toHaveBeenCalled();
      expect(mockLLMService.enhanceSearchResults).toHaveBeenCalled();
      expect(mockUserService.addToSearchHistory).toHaveBeenCalled();
    });

    it('should return cached results when available', async () => {
      const cachedResults = [mockSearchResult];
      
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCacheService.get as Mock).mockResolvedValue(cachedResults);

      const results = await searchService.searchFood('пицца', 123456);

      expect(results).toEqual(cachedResults);
      expect(mockCachedYEService.searchItems).not.toHaveBeenCalled();
      expect(mockLLMService.transformQuery).not.toHaveBeenCalled();
    });

    it('should throw error when user not found', async () => {
      (mockUserService.getUser as Mock).mockResolvedValue(null);

      await expect(searchService.searchFood('пицца', 999999))
        .rejects.toThrow('Пользователь не найден');
    });

    it('should limit results to maxResults config', async () => {
      const manyResults = Array.from({ length: 20 }, (_, i) => ({
        ...mockSearchResult,
        id: `result-${i}`,
        name: `Item ${i}`
      }));

      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockCachedYEService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.transformQuery as Mock).mockResolvedValue(mockStructuredQuery);
      (mockCachedYEService.searchItems as Mock).mockResolvedValue(Array(20).fill(mockMenuItem));
      (mockUserService.getSearchHistory as Mock).mockResolvedValue([]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue(manyResults);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(mockSearchHistory);

      const results = await searchService.searchFood('test', 123456);

      expect(results).toHaveLength(10); // Should be limited by maxResults config
    });

    it('should handle search errors gracefully', async () => {
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockCachedYEService.getRestaurants as Mock).mockRejectedValue(new Error('API Error'));

      await expect(searchService.searchFood('test', 123456))
        .rejects.toThrow('Не удалось получить список ресторанов');

      // Should still try to save failed search to history
      expect(mockUserService.addToSearchHistory).toHaveBeenCalledWith(
        123456,
        'test',
        {},
        []
      );
    });
  });

  describe('processNaturalLanguageQuery', () => {
    it('should transform query using LLM service', async () => {
      const restaurants = ['Restaurant 1', 'Restaurant 2'];
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockLLMService.transformQuery as Mock).mockResolvedValue(mockStructuredQuery);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);

      const result = await searchService.processNaturalLanguageQuery('острая пицца', restaurants);

      expect(result).toEqual(mockStructuredQuery);
      expect(mockLLMService.transformQuery).toHaveBeenCalledWith('острая пицца', restaurants);
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return cached transformation when available', async () => {
      const restaurants = ['Restaurant 1'];
      
      (mockCacheService.get as Mock).mockResolvedValue(mockStructuredQuery);

      const result = await searchService.processNaturalLanguageQuery('пицца', restaurants);

      expect(result).toEqual(mockStructuredQuery);
      expect(mockLLMService.transformQuery).not.toHaveBeenCalled();
    });

    it('should handle LLM transformation errors', async () => {
      const restaurants = ['Restaurant 1'];
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockLLMService.transformQuery as Mock).mockRejectedValue(new Error('LLM Error'));

      await expect(searchService.processNaturalLanguageQuery('test', restaurants))
        .rejects.toThrow('Не удалось обработать запрос');
    });
  });

  describe('filterByGeolocation', () => {
    it('should filter results by basic availability', async () => {
      const validResult = {
        ...mockSearchResult,
        orderUrl: 'https://valid-url.com',
        price: 500
      };

      const invalidResult = {
        ...mockSearchResult,
        id: '2',
        orderUrl: '',
        price: 0
      };

      const results = await searchService.filterByGeolocation(
        [validResult, invalidResult], 
        EAvailableCities.PERM
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(validResult);
    });
  });

  describe('enhanceResultsWithLLM', () => {
    it('should enhance results using LLM service', async () => {
      const originalResults = [mockSearchResult];
      const enhancedResults = [{ ...mockSearchResult, rankingScore: 0.9 }];
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue(enhancedResults);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);

      const results = await searchService.enhanceResultsWithLLM(originalResults, 'острая пицца');

      expect(results).toEqual(enhancedResults);
      expect(mockLLMService.enhanceSearchResults).toHaveBeenCalledWith(originalResults, 'острая пицца');
    });

    it('should return original results on LLM error', async () => {
      const originalResults = [mockSearchResult];
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockLLMService.enhanceSearchResults as Mock).mockRejectedValue(new Error('LLM Error'));

      const results = await searchService.enhanceResultsWithLLM(originalResults, 'test');

      expect(results).toEqual(originalResults);
    });

    it('should return empty array for empty input', async () => {
      const results = await searchService.enhanceResultsWithLLM([], 'test');

      expect(results).toEqual([]);
      expect(mockLLMService.enhanceSearchResults).not.toHaveBeenCalled();
    });
  });

  describe('getRankedResults', () => {
    it('should rank results using ResultRanker', async () => {
      const results = [mockSearchResult];
      const userHistory = [mockSearchHistory];
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);

      const rankedResults = await searchService.getRankedResults(results, mockStructuredQuery, userHistory);

      expect(rankedResults).toHaveLength(1);
      expect(rankedResults[0]).toHaveProperty('rankingScore');
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return cached ranking when available', async () => {
      const cachedRanking = [{ ...mockSearchResult, rankingScore: 0.8 }];
      
      (mockCacheService.get as Mock).mockResolvedValue(cachedRanking);

      const results = await searchService.getRankedResults([mockSearchResult], mockStructuredQuery);

      expect(results).toEqual(cachedRanking);
    });

    it('should return original results on ranking error', async () => {
      const results = [mockSearchResult];
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockCacheService.set as Mock).mockRejectedValue(new Error('Cache Error'));

      const rankedResults = await searchService.getRankedResults(results, mockStructuredQuery);

      expect(rankedResults).toHaveLength(1);
    });

    it('should handle empty results', async () => {
      const results = await searchService.getRankedResults([], mockStructuredQuery);

      expect(results).toEqual([]);
    });
  });

  describe('getSearchHistory', () => {
    it('should get search history from user service', async () => {
      const history = [mockSearchHistory];
      
      (mockUserService.getSearchHistory as Mock).mockResolvedValue(history);

      const result = await searchService.getSearchHistory(123456, 10);

      expect(result).toEqual(history);
      expect(mockUserService.getSearchHistory).toHaveBeenCalledWith(123456, 10);
    });

    it('should handle user service errors', async () => {
      (mockUserService.getSearchHistory as Mock).mockRejectedValue(new Error('DB Error'));

      await expect(searchService.getSearchHistory(123456))
        .rejects.toThrow('SEARCH_HISTORY_GET_FAILED');
    });
  });

  describe('getSearchAnalytics', () => {
    it('should analyze user search history', async () => {
      const history = [mockSearchHistory];
      const expectedAnalytics = {
        totalSearches: 1,
        successfulSearches: 1,
        successRate: 1,
        popularQueries: [{ query: 'пицца', count: 1, lastUsed: expect.any(Date) }],
        popularRestaurants: [{ restaurant: 'Test Restaurant', count: 1, lastUsed: expect.any(Date) }],
      };
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockUserService.getSearchHistory as Mock).mockResolvedValue(history);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);

      const analytics = await searchService.getSearchAnalytics(123456);

      expect(analytics).toMatchObject({
        totalSearches: expect.any(Number),
        successfulSearches: expect.any(Number),
        successRate: expect.any(Number),
      });
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return cached analytics when available', async () => {
      const cachedAnalytics = { totalSearches: 5, successRate: 0.8 };
      
      (mockCacheService.get as Mock).mockResolvedValue(cachedAnalytics);

      const analytics = await searchService.getSearchAnalytics(123456);

      expect(analytics).toEqual(cachedAnalytics);
      expect(mockUserService.getSearchHistory).not.toHaveBeenCalled();
    });
  });

  describe('getPersonalizedRecommendations', () => {
    it('should generate personalized recommendations', async () => {
      const history = [mockSearchHistory];
      
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockUserService.getSearchHistory as Mock).mockResolvedValue(history);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);

      const recommendations = await searchService.getPersonalizedRecommendations(123456);

      expect(recommendations).toHaveProperty('recommendedQueries');
      expect(recommendations).toHaveProperty('recommendedRestaurants');
      expect(recommendations).toHaveProperty('recommendedPriceRange');
    });

    it('should handle errors gracefully', async () => {
      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockUserService.getSearchHistory as Mock).mockRejectedValue(new Error('DB Error'));

      const recommendations = await searchService.getPersonalizedRecommendations(123456);

      expect(recommendations).toEqual({
        recommendedQueries: [],
        recommendedRestaurants: [],
        recommendedPriceRange: null
      });
    });
  });

  describe('cache management', () => {
    it('should invalidate user cache', async () => {
      (mockCacheService.delete as Mock).mockResolvedValue(undefined);

      await searchService.invalidateUserCache(123456);

      expect(mockCacheService.delete).toHaveBeenCalled();
    });

    it('should get cache stats', async () => {
      const stats = { totalKeys: 100, memory: '1MB' };
      
      (mockCacheService.getStats as Mock).mockResolvedValue(stats);

      const result = await searchService.getCacheStats();

      expect(result).toEqual(stats);
    });

    it('should handle cache stats errors', async () => {
      (mockCacheService.getStats as Mock).mockRejectedValue(new Error('Cache Error'));

      const result = await searchService.getCacheStats();

      expect(result).toBeNull();
    });
  });
});