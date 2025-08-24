import type { Mock } from 'vitest';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { TMenuItem } from '@/types/menuItem';
import type { UserService } from '@/services/user/UserService';
import type { LLMService } from '@/services/search/LLMService/LLMService';
import type { TYERestaurant } from '@/services/platforms/yandexEda/yeApiService/types';
import type { CachedYEService } from '@/services/platforms/yandexEda/cachedYEService/CachedYEService';
import type { CacheService } from '@/services/cacheService/CacheService';

import { ESubscriptionType, type TUser } from '@/services/user/types';
import { EAvailableCities } from '@/config/bot';

import { SearchService } from './SearchService';

describe('SearchService', () => {
  let searchService: SearchService;
  let mockLLMService: LLMService;
  let mockCachedYEService: CachedYEService;
  let mockUserService: UserService;
  let mockCacheService: CacheService;

  const mockUser: TUser = {
    telegramId: 123456789,
    chatId: 987654321,
    city: EAvailableCities.PERM,
    subscription: ESubscriptionType.BASIC,
    subscriptionExpiry: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRestaurant: TYERestaurant = {
    id: 'restaurant1',
    name: 'Test Restaurant',
    coordinates: { latitude: 58.0105, longitude: 56.2294 },
    workingHours: { open: '10:00', close: '22:00', isOpen: true },
    lastUpdated: new Date(),
    additionalInfo: { brandSlug: 'test-brand' },
  };

  const mockMenuItem: TMenuItem = {
    id: 'item1',
    name: 'Test Pizza',
    description: 'Delicious test pizza',
    ingredients: ['dough', 'cheese', 'tomato'],
    price: 500,
    available: true,
    restaurant: mockRestaurant,
  };

  const mockSearchResult: TSearchResultItem = {
    id: 'item1',
    name: 'Test Pizza',
    restaurant: { id: 'restaurant1', name: 'Test Restaurant' },
    description: 'Delicious test pizza',
    tags: ['пицца', 'итальянская'],
    price: 500,
    image: 'https://example.com/pizza.jpg',
    orderUrl: 'https://eda.yandex.ru/restaurant1',
  };

  beforeEach(() => {
    // Мокаем CacheService
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      getStats: vi.fn(),
    } as unknown as CacheService;

    // Мокаем LLMService
    mockLLMService = {
      transformQuery: vi.fn(),
      enhanceSearchResults: vi.fn(),
    } as unknown as LLMService;

    // Мокаем CachedYEService
    mockCachedYEService = {
      getRestaurants: vi.fn(),
      getRestaurantMenu: vi.fn(),
      searchItems: vi.fn(),
      invalidateCache: vi.fn(),
      getCacheStats: vi.fn(),
    } as unknown as CachedYEService;

    // Мокаем UserService
    mockUserService = {
      getUser: vi.fn(),
      addToSearchHistory: vi.fn(),
      getSearchHistory: vi.fn(),
    } as unknown as UserService;

    searchService = new SearchService(
      mockLLMService,
      mockCachedYEService,
      mockUserService,
      mockCacheService,
    );
  });

  describe('searchFood', () => {
    it('должен успешно выполнить поиск еды', async () => {
      // Настройка моков
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCachedYEService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.transformQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockCachedYEService.searchMenuItems as Mock).mockResolvedValue([mockMenuItem]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(undefined);
      (mockCacheService.set as Mock).mockResolvedValue(undefined);

      const result = await searchService.searchFood('хочу пиццу', 123456789);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockSearchResult);
      expect(mockUserService.getUser).toHaveBeenCalledWith(123456789);
      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledWith(EAvailableCities.PERM);
      expect(mockLLMService.transformQuery).toHaveBeenCalledWith('хочу пиццу', ['Test Restaurant']);
      expect(mockCachedYEService.searchMenuItems).toHaveBeenCalledWith(
        { tags: ['пицца'] },
        EAvailableCities.PERM,
      );
      expect(mockUserService.addToSearchHistory).toHaveBeenCalled();
    });

    it('должен кэшировать результаты поиска', async () => {
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCachedYEService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.transformQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockCachedYEService.searchMenuItems as Mock).mockResolvedValue([mockMenuItem]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(undefined);

      await searchService.searchFood('хочу пиццу', 123456789);

      expect(mockCacheService.set).toHaveBeenCalledTimes(3); // Кэширование структурированного запроса, результатов поиска и финальных результатов
    });

    it('должен использовать кэшированные результаты структурированного запроса', async () => {
      const cachedQuery: TStructuredQuery = { tags: ['пицца'] };

      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCachedYEService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockCacheService.get as Mock)
        .mockResolvedValueOnce(cachedQuery) // для структурированного запроса
        .mockResolvedValueOnce([mockSearchResult]); // для результатов поиска
      (mockCachedYEService.searchMenuItems as Mock).mockResolvedValue([mockMenuItem]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(undefined);

      await searchService.searchFood('хочу пиццу', 123456789);

      expect(mockLLMService.transformQuery).not.toHaveBeenCalled();
      expect(mockCacheService.get).toHaveBeenCalled();
    });

    it('должен ограничить количество результатов', async () => {
      const mockResults = Array.from({ length: 5 }, (_, i) => ({
        ...mockSearchResult,
        id: `item${i}`,
      }));

      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCachedYEService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.transformQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockCachedYEService.searchMenuItems as Mock).mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ ...mockMenuItem, id: `item${i}` })),
      );
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue(mockResults);
      (mockUserService.addToSearchHistory as Mock).mockResolvedValue(undefined);

      const result = await searchService.searchFood('хочу пиццу', 123456789, { maxResults: 3 });

      expect(result).toHaveLength(3);
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
      (mockUserService.getUser as Mock).mockResolvedValue(mockUser);
      (mockCachedYEService.getRestaurants as Mock).mockResolvedValue([mockRestaurant]);
      (mockLLMService.transformQuery as Mock).mockResolvedValue({ tags: ['пицца'] });
      (mockCachedYEService.searchMenuItems as Mock).mockResolvedValue([mockMenuItem]);
      (mockLLMService.enhanceSearchResults as Mock).mockResolvedValue([mockSearchResult]);
      (mockUserService.addToSearchHistory as Mock).mockRejectedValue(new Error('Database error'));

      const result = await searchService.searchFood('хочу пиццу', 123456789);

      expect(result).toHaveLength(1);
      expect(mockUserService.addToSearchHistory).toHaveBeenCalled();
    });
  });

  describe('processNaturalLanguageQuery', () => {
    it('должен успешно обработать естественный запрос', async () => {
      const query = 'хочу острую пиццу';
      const availableRestaurants = ['Domino\'s', 'Papa John\'s'];
      const expectedResult: TStructuredQuery = {
        tags: ['острый', 'пикант', 'пицца'],
        restaurants: ['Domino\'s'],
      };

      (mockLLMService.transformQuery as Mock).mockResolvedValue(expectedResult);

      const result = await searchService.processNaturalLanguageQuery(query, availableRestaurants);

      expect(result).toEqual(expectedResult);
      expect(mockLLMService.transformQuery).toHaveBeenCalledWith(query, availableRestaurants);
    });

    it('должен использовать fallback логику при ошибке LLM', async () => {
      const query = 'хочу пиццу';
      const availableRestaurants = ['Domino\'s'];

      (mockCacheService.get as Mock).mockResolvedValue(null);
      (mockLLMService.transformQuery as Mock).mockRejectedValue(new Error('LLM error'));

      const result = await searchService.processNaturalLanguageQuery(query, availableRestaurants);

      expect(result).toEqual({ tags: [] });
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
          tags: ['dough', 'cheese', 'tomato'],
          price: 500,
          image: undefined,
          orderUrl: 'https://eda.yandex.ru/restaurant1',
        });
      });
    });

    describe('rankSearchResults', () => {
      it('должен ранжировать результаты по приоритету', () => {
        const results: TSearchResultItem[] = [
          { ...mockSearchResult, id: '1', price: 1000, image: undefined },
          { ...mockSearchResult, id: '2', price: 500, image: 'image.jpg' },
          { ...mockSearchResult, id: '3', price: 300, image: 'image.jpg' },
        ];

        const ranked = (searchService as unknown as {
          rankSearchResults: (results: TSearchResultItem[]) => TSearchResultItem[];
        }).rankSearchResults(results);

        expect(ranked[0].id).toBe('3'); // Самый дешевый с изображением
        expect(ranked[1].id).toBe('2'); // Более дешевый с изображением
        expect(ranked[2].id).toBe('1'); // Самый дорогой без изображения
      });
    });

    describe('createFallbackQuery', () => {
      it('должен создать базовый структурированный запрос', () => {
        const result = (searchService as unknown as {
          createFallbackQuery: (query: string) => TStructuredQuery;
        }).createFallbackQuery('хочу острый пицца');

        expect(result).toEqual({
          tags: ['пицца', 'острый'],
        });
      });

      it('должен обработать запрос без ключевых слов', () => {
        const result = (searchService as unknown as {
          createFallbackQuery: (query: string) => TStructuredQuery;
        }).createFallbackQuery('хочу что-то вкусное');

        expect(result).toEqual({ tags: [] });
      });
    });

    describe('generateOrderUrl', () => {
      it('должен сгенерировать URL для заказа', () => {
        const url = (searchService as unknown as {
          generateOrderUrl: (item: TMenuItem) => string;
        }).generateOrderUrl(mockMenuItem);

        expect(url).toBe('https://eda.yandex.ru/restaurant1');
      });
    });
  });
});
