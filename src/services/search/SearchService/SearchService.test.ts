import type { Mock } from 'vitest';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TSearchResultItem } from '@/types/search';
import type { TRestaurant } from '@/types/restaurant';
import type { UserService } from '@/services/user/UserService/UserService';
import type { VectorSearchService } from '@/services/search/VectorSearchService/VectorSearchService';
import type { YESearchService } from '@/services/platforms/yandexEda/yeSearchService/YESearchService';
import type { YEApiService } from '@/services/platforms/yandexEda/yeApiService/YEApiService';
import type { LLMService } from '@/services/LLMService/LLMService';
import type { CacheService } from '@/services/cacheService/CacheService';
import type { AnalyticsService } from '@/services/analytics/AnalyticsService/AnalyticsService';

import { EDishCategory, type TMenuItem } from '@/types/menuItem';
import { EAvailableCities } from '@/config/bot/types';

import { SearchService } from './SearchService';

describe('SearchService', () => {
  let searchService: SearchService;
  let mockLLMService: LLMService;
  let mockYEApiService: YEApiService;
  let mockYESearchService: YESearchService;
  let mockUserService: UserService;
  let mockCacheService: CacheService;
  let mockVectorSearchService: VectorSearchService;
  let mockAnalyticsService: AnalyticsService;

  const mockUser = {
    telegramId: 123456789,
    city: EAvailableCities.PERM,
  };

  const mockRestaurant: TRestaurant = {
    id: 'restaurant1',
    name: 'Test Restaurant',
    coordinates: {
      latitude: 0,
      longitude: 0,
    },
    lastUpdated: new Date(),
  };

  const mockMenuItem: TMenuItem = {
    id: 'item1',
    name: 'Test Pizza',
    description: 'Delicious test pizza',
    ingredients: ['cheese', 'tomato'],
    price: 800,
    image: 'test-image.jpg',
    available: true,
    restaurant: mockRestaurant,
    orderUrl: 'https://test.com/order',
    category: EDishCategory.MAIN,
  };

  const mockSearchResult: TSearchResultItem = {
    id: 'item1',
    name: 'Test Pizza',
    description: 'Delicious test pizza',
    tags: ['cheese', 'tomato'],
    price: 800,
    restaurant: {
      id: 'restaurant1',
      name: 'Test Restaurant',
    },
    orderUrl: 'https://test.com/order',
    image: 'test-image.jpg',
    category: EDishCategory.MAIN,
  };

  beforeEach(() => {
    // Мокаем LLMService
    mockLLMService = {
      stuctureQuery: vi.fn(),
      enhanceSearchResults: vi.fn(),
    } as unknown as LLMService;

    // Мокаем CacheService
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      invalidateCache: vi.fn(),
      getCacheStats: vi.fn(),
    } as unknown as CacheService;

    // Мокаем YEApiService
    mockYEApiService = {
      getRestaurants: vi.fn(),
      getRestaurantMenu: vi.fn(),
      invalidateCache: vi.fn(),
      getCacheStats: vi.fn(),
    } as unknown as YEApiService;

    // Мокаем UserService
    mockUserService = {
      getUser: vi.fn(),
      addToSearchHistory: vi.fn(),
      getSearchHistory: vi.fn(),
    } as unknown as UserService;

    // Мокаем YESearchService
    mockYESearchService = {
      searchMenu: vi.fn(),
    } as unknown as YESearchService;

    // Мокаем VectorSearchService
    mockVectorSearchService = {
      searchMenuWithLightRAG: vi.fn(),
      searchMenuWithRAG: vi.fn(),
      initializeEmbeddingModel: vi.fn(),
    } as unknown as VectorSearchService;

    // Мокаем AnalyticsService
    mockAnalyticsService = {
      trackError: vi.fn(),
      trackPerformance: vi.fn(),
      trackSearchQueryStarted: vi.fn(),
      trackSearchQueryCompleted: vi.fn(),
    } as unknown as AnalyticsService;

    searchService = new SearchService(
      mockLLMService,
      mockYEApiService,
      mockYESearchService,
      mockUserService,
      mockCacheService,
      mockVectorSearchService,
      mockAnalyticsService,
    );
  });

  describe('searchFood', () => {
    it('должен успешно выполнить поиск еды через векторный поиск', async () => {
      // Настройка моков для векторного поиска
      (mockYEApiService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.stuctureQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockVectorSearchService.searchMenuWithRAG as Mock).mockResolvedValue([mockSearchResult]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(undefined);

      const result = await searchService.searchFood('хочу пиццу', 123456789, {
        enableVectorSearch: true,
        searchIn: 'RAG',
      });

      expect(result).toHaveLength(1);
      // Проверяем только основные поля, так как векторный поиск может изменить формат
      expect(result[0].id).toBe(mockSearchResult.id);
      expect(result[0].name).toBe(mockSearchResult.name);
      expect(result[0].price).toBe(mockSearchResult.price);
      expect(mockUserService.getUser).toHaveBeenCalledWith(123456789);
      expect(mockVectorSearchService.searchMenuWithRAG).toHaveBeenCalledWith('хочу пиццу', {
        limit: 200,
        category: undefined,
        restaurantNames: undefined,
        minPrice: undefined,
        minSimilarity: 0.3,
        maxPrice: undefined,
        city: EAvailableCities.PERM,
      });
      expect(mockUserService.addToSearchHistory).toHaveBeenCalled();
    });

    it('должен использовать традиционный поиск если векторный не дал результатов', async () => {
      // Настройка моков
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockVectorSearchService.searchMenuWithRAG as Mock).mockResolvedValue([]); // Пустой результат
      (mockYEApiService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.stuctureQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockYESearchService.searchMenu as Mock).mockResolvedValue([mockMenuItem]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(undefined);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);

      const result = await searchService.searchFood('хочу пиццу', 123456789, {
        enableVectorSearch: true,
        searchIn: 'RAG',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockSearchResult);
      expect(mockVectorSearchService.searchMenuWithRAG).toHaveBeenCalled();
      expect(mockYEApiService.getRestaurants).toHaveBeenCalledWith(EAvailableCities.PERM);
      expect(mockLLMService.stuctureQuery).toHaveBeenCalledWith('хочу пиццу', [mockRestaurant]);
      expect(mockUserService.addToSearchHistory).toHaveBeenCalled();
    });

    it('не должен ограничить количество результатов', async () => {
      const mockResults = Array.from({ length: 5 }, (_, i) => ({
        ...mockSearchResult,
        id: `item${i}`,
      }));

      (mockYEApiService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.stuctureQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockVectorSearchService.searchMenuWithRAG as Mock).mockResolvedValue(mockResults);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue(mockResults);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(undefined);

      const result = await searchService.searchFood('хочу пиццу', 123456789, {
        enableVectorSearch: true,
        searchIn: 'RAG',
      });

      expect(result).toHaveLength(5);
    });

    it('должен обрабатывать ошибку если пользователь не найден', async () => {
      (mockUserService.getUser as Mock).mockResolvedValue(null);

      await expect(searchService.searchFood('хочу пиццу', 123456789))
        .rejects
        .toThrow('Пользователь не найден');
    });

    it('должен обрабатывать ошибку валидации поискового запроса', async () => {
      await expect(searchService.searchFood('', 123456789))
        .rejects
        .toThrow('INVALID_SEARCH_QUERY');
    });

    it('должен продолжать работу при ошибке сохранения истории поиска', async () => {
      (mockYEApiService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.stuctureQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockVectorSearchService.searchMenuWithRAG as Mock).mockResolvedValue([mockSearchResult]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockUserService.addToSearchHistory as Mock).mockRejectedValue(new Error('Database error'));

      const result = await searchService.searchFood('хочу пиццу', 123456789, {
        enableVectorSearch: true,
        searchIn: 'RAG',
      });

      expect(result).toHaveLength(1);
      expect(mockUserService.addToSearchHistory).toHaveBeenCalled();
    });
  });

  describe('enhanceResultsWithLLM', () => {
    it('должен успешно улучшить результаты через LLM', async () => {
      const originalResults: TSearchResultItem[] = [mockSearchResult];
      const enhancedResults: TSearchResultItem[] = [{
        ...mockSearchResult,
        name: 'Enhanced Test Pizza',
      }];

      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue(enhancedResults);

      const result = await searchService.enhanceResultsWithLLM(originalResults, 'хочу пиццу');

      expect(result).toEqual(enhancedResults);
      expect(mockLLMService.enhanceSearchResults).toHaveBeenCalledWith(originalResults, 'хочу пиццу');
    });

    it('должен вернуть оригинальные результаты при ошибке LLM', async () => {
      const originalResults: TSearchResultItem[] = [mockSearchResult];

      (mockLLMService.enhanceSearchResults as Mock).mockRejectedValue(new Error('LLM error'));

      const result = await searchService.enhanceResultsWithLLM(originalResults, 'хочу пиццу');

      expect(result).toEqual(originalResults);
    });

    it('должен вернуть пустой массив если вход пустой', async () => {
      const result = await searchService.enhanceResultsWithLLM([], 'хочу пиццу');

      expect(result).toEqual([]);
      expect(mockLLMService.enhanceSearchResults).not.toHaveBeenCalled();
    });
  });

  describe('getSearchStats', () => {
    it('должен вернуть статистику поиска', async () => {
      const mockHistory = [
        {
          id: '1',
          query: 'пицца',
          structuredQuery: { tags: ['пицца'] },
          results: [mockSearchResult],
          timestamp: new Date('2024-01-01'),
        },
        {
          id: '2',
          query: 'суши',
          structuredQuery: { tags: ['суши'] },
          results: [mockSearchResult, mockSearchResult],
          timestamp: new Date('2024-01-02'),
        },
      ];

      (mockUserService.getSearchHistory as Mock).mockResolvedValue(mockHistory);

      const stats = await searchService.getSearchStats(123456789);

      expect(stats).toEqual({
        totalSearches: 2,
        averageResults: 2,
        lastSearchDate: new Date('2024-01-02'),
      });
    });

    it('должен вернуть нулевую статистику если истории нет', async () => {
      (mockUserService.getSearchHistory as Mock).mockResolvedValue([]);

      const stats = await searchService.getSearchStats(123456789);

      expect(stats).toEqual({
        totalSearches: 0,
        averageResults: 0,
        lastSearchDate: null,
      });
    });
  });

  describe('private methods', () => {
    describe('transformMenuItemsToSearchResults', () => {
      it('должен корректно преобразовать MenuItem в SearchResult', () => {
        const menuItems: TMenuItem[] = [mockMenuItem];
        const result = (searchService as unknown as {
          transformMenuItemsToSearchResults: (menuItems: TMenuItem[]) => TSearchResultItem[];
        }).transformMenuItemsToSearchResults(menuItems);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: 'item1',
          name: 'Test Pizza',
          restaurant: { id: 'restaurant1', name: 'Test Restaurant' },
          description: 'Delicious test pizza',
          tags: ['cheese', 'tomato'],
          price: 800,
          image: 'test-image.jpg',
          orderUrl: 'https://test.com/order',
          category: EDishCategory.MAIN,
        });
      });
    });
  });
});
