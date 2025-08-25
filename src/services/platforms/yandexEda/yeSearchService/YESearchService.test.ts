import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TStructuredQuery } from '@/types/search';
import type { TCoordinates } from '@/types/restaurant';
import type { TRestaurant } from '@/types/restaurant';
import type { EAvailableCities } from '@/config/bot/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { CityValidator } from '@/utils/CityValidator';
import { EDishCategory, type TMenuItem } from '@/types/menuItem';

import type { YEApiService } from '../yeApiService/YEApiService';
import type { CacheService } from '../../../cacheService/CacheService';

import { YESearchService } from './YESearchService';

// Мокаем ConsoleLogger
vi.mock('@/utils/ConsoleLogger', () => ({
  ConsoleLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedConsoleLogger = vi.mocked(ConsoleLogger);

describe('YESearchService', () => {
  let service: YESearchService;
  let mockYEApiService: YEApiService;
  let mockCacheService: CacheService;

  const mockCoordinates: TCoordinates = {
    latitude: 58.010454,
    longitude: 56.229441,
  };

  const mockRestaurant: TRestaurant = {
    id: 'test-restaurant',
    name: 'Тест Ресторан',
    coordinates: mockCoordinates,
    lastUpdated: new Date(),
  };

  const mockMenuItem: TMenuItem = {
    id: 'test-item-1',
    name: 'Бургер с говядиной',
    description: 'Сочный бургер с говяжьей котлетой',
    ingredients: ['говядина', 'булочка', 'салат', 'томат'],
    price: 500,
    image: 'https://example.com/burger.jpg',
    available: true,
    restaurant: mockRestaurant,
    orderUrl: 'https://eda.yandex.ru/order',
    category: EDishCategory.MAIN,
  };

  const mockMenuItem2: TMenuItem = {
    id: 'test-item-2',
    name: 'Пицца Маргарита',
    description: 'Классическая пицца с томатами и моцареллой',
    ingredients: ['тесто', 'томат', 'моцарелла', 'базилик'],
    price: 800,
    image: 'https://example.com/pizza.jpg',
    available: true,
    restaurant: mockRestaurant,
    orderUrl: 'https://eda.yandex.ru/order',
    category: EDishCategory.MAIN,
  };

  const mockMenuItem3: TMenuItem = {
    id: 'test-item-3',
    name: 'Салат Цезарь',
    description: 'Салат с курицей и сухариками',
    ingredients: ['курица', 'салат', 'сухарики', 'сыр'],
    price: 300,
    image: 'https://example.com/salad.jpg',
    available: false, // недоступен
    restaurant: mockRestaurant,
    orderUrl: 'https://eda.yandex.ru/order',
    category: EDishCategory.MAIN,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(CityValidator, 'getCityCoordinates').mockReturnValue(mockCoordinates);

    mockYEApiService = {
      getRestaurants: vi.fn(),
      getRestaurantMenu: vi.fn(),
    } as unknown as YEApiService;

    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      getStats: vi.fn(),
    } as unknown as CacheService;

    service = new YESearchService(mockYEApiService, mockCacheService);
  });

  describe('searchMenu', () => {
    const mockCity: EAvailableCities = 'Пермь' as EAvailableCities;
    const mockQuery: TStructuredQuery = {
      restaurants: ['тест'],
      tags: ['говядина'],
      priceRange: { min: 400, max: 600 },
    };

    it('должен вернуть данные из кэша если они есть', async () => {
      const cachedItems = [mockMenuItem];
      mockCacheService.get = vi.fn().mockResolvedValue(cachedItems);

      const result = await service.searchMenu(mockQuery, mockCity);

      expect(result).toEqual(cachedItems);
      expect(mockCacheService.get).toHaveBeenCalledWith(
        'search:58.0105,56.2294:тест|говядина|400-600||',
      );
      expect(mockYEApiService.getRestaurants).not.toHaveBeenCalled();
    });

    it('должен загрузить и отфильтровать данные если их нет в кэше', async () => {
      mockCacheService.get = vi.fn().mockResolvedValue(null);
      mockYEApiService.getRestaurants = vi.fn().mockResolvedValue([mockRestaurant]);
      mockYEApiService.getRestaurantMenu = vi.fn().mockResolvedValue([mockMenuItem, mockMenuItem2, mockMenuItem3]);
      mockCacheService.set = vi.fn().mockResolvedValue(undefined);

      const result = await service.searchMenu(mockQuery, mockCity);

      expect(result).toEqual([mockMenuItem]); // только доступный бургер с говядиной в ценовом диапазоне
      expect(mockYEApiService.getRestaurants).toHaveBeenCalledWith(mockCity);
      expect(mockYEApiService.getRestaurantMenu).toHaveBeenCalledWith(mockRestaurant.id, mockCity);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'search:58.0105,56.2294:тест|говядина|400-600||',
        [mockMenuItem],
        900,
      );
    });

    it('должен обработать ошибку получения координат', async () => {
      vi.spyOn(CityValidator, 'getCityCoordinates').mockReturnValue(null);

      await expect(service.searchMenu(mockQuery, mockCity)).rejects.toThrow(
        'Не удалось получить координаты для города Пермь Яндекс.Еда',
      );
    });

    it('должен продолжить работу при ошибке загрузки меню ресторана', async () => {
      mockCacheService.get = vi.fn().mockResolvedValue(null);
      mockYEApiService.getRestaurants = vi.fn().mockResolvedValue([mockRestaurant]);
      mockYEApiService.getRestaurantMenu = vi.fn().mockRejectedValue(new Error('API Error'));
      mockCacheService.set = vi.fn().mockResolvedValue(undefined);

      const result = await service.searchMenu(mockQuery, mockCity);

      expect(result).toEqual([]);
      expect(mockedConsoleLogger.warn).toHaveBeenCalledWith(
        'Не удалось загрузить меню для ресторана Яндекс.Еда',
        expect.objectContaining({
          restaurantId: mockRestaurant.id,
          error: 'API Error',
        }),
      );
    });

    it('должен обработать общую ошибку API', async () => {
      mockCacheService.get = vi.fn().mockResolvedValue(null);
      mockYEApiService.getRestaurants = vi.fn().mockRejectedValue(new Error('Network Error'));

      await expect(service.searchMenu(mockQuery, mockCity)).rejects.toThrow(
        'Не удалось выполнить поиск Яндекс.Еда для Пермь',
      );
    });

    it('должен загружать меню для нескольких ресторанов', async () => {
      const mockRestaurant2: TRestaurant = {
        ...mockRestaurant,
        id: 'test-restaurant-2',
        name: 'Другой Ресторан',
      };

      mockCacheService.get = vi.fn().mockResolvedValue(null);
      mockYEApiService.getRestaurants = vi.fn().mockResolvedValue([mockRestaurant, mockRestaurant2]);
      mockYEApiService.getRestaurantMenu = vi.fn()
        .mockResolvedValueOnce([mockMenuItem])
        .mockResolvedValueOnce([mockMenuItem2]);
      mockCacheService.set = vi.fn().mockResolvedValue(undefined);

      const result = await service.searchMenu(mockQuery, mockCity);

      expect(result).toEqual([mockMenuItem]); // только первый проходит фильтр (содержит "Тест" в названии ресторана)
      expect(mockYEApiService.getRestaurantMenu).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateCache', () => {
    it('должен успешно очистить кэш', async () => {
      mockCacheService.clear = vi.fn().mockResolvedValue(undefined);

      await service.invalidateCache();

      expect(mockCacheService.clear).toHaveBeenCalled();
      expect(mockedConsoleLogger.info).toHaveBeenCalledWith('Весь кэш Яндекс.Еда очищен');
    });

    it('должен обработать ошибку очистки кэша', async () => {
      const error = new Error('Cache clear failed');
      mockCacheService.clear = vi.fn().mockRejectedValue(error);

      await expect(service.invalidateCache()).rejects.toThrow(
        'Не удалось очистить кэш Яндекс.Еда',
      );
      expect(mockedConsoleLogger.error).toHaveBeenCalledWith(
        'Не удалось очистить кэш Яндекс.Еда',
        error,
      );
    });
  });

  describe('getCacheStats', () => {
    it('должен вернуть статистику кэша', async () => {
      const mockStats = {
        totalKeys: 10,
        memoryUsage: 1024,
        hitRate: 0.8,
        missRate: 0.2,
      };
      mockCacheService.getStats = vi.fn().mockResolvedValue(mockStats);

      const result = await service.getCacheStats();

      expect(result).toEqual(mockStats);
      expect(mockCacheService.getStats).toHaveBeenCalled();
    });

    it('должен обработать ошибку получения статистики', async () => {
      const error = new Error('Stats failed');
      mockCacheService.getStats = vi.fn().mockRejectedValue(error);

      await expect(service.getCacheStats()).rejects.toThrow();
    });
  });

  describe('filterMenuItems', () => {
    const allItems = [mockMenuItem, mockMenuItem2, mockMenuItem3];

    it('должен фильтровать недоступные товары', () => {
      const query: TStructuredQuery = {};
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem, mockMenuItem2]); // исключен mockMenuItem3 (available: false)
    });

    it('должен фильтровать по ресторанам', () => {
      const query: TStructuredQuery = {
        restaurants: ['тест'],
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem, mockMenuItem2]); // все из Тест Ресторан (содержит "тест" в нижнем регистре)
    });

    it('должен исключать товары из несовпадающих ресторанов', () => {
      const query: TStructuredQuery = {
        restaurants: ['Другой Ресторан'],
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([]); // нет товаров из Другой Ресторан
    });

    it('должен фильтровать по тегам в ингредиентах', () => {
      const query: TStructuredQuery = {
        tags: ['говядина'],
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem]); // только бургер содержит говядину
    });

    it('должен фильтровать по тегам в описании', () => {
      const query: TStructuredQuery = {
        tags: ['котлетой'],
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem]); // только бургер содержит "котлетой" в описании
    });

    it('должен фильтровать по тегам в названии', () => {
      const query: TStructuredQuery = {
        tags: ['Бургер'],
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem]); // только бургер содержит "Бургер" в названии
    });

    it('должен фильтровать по ценовому диапазону', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 400, max: 600 },
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem]); // только бургер в диапазоне 400-600
    });

    it('должен исключать товары по ресторанам', () => {
      const query: TStructuredQuery = {
        exclusions: {
          restaurants: ['Тест Ресторан'],
        },
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([]); // все товары исключены
    });

    it('должен исключать товары по тегам в ингредиентах', () => {
      const query: TStructuredQuery = {
        exclusions: {
          tags: ['говядина'],
        },
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem2]); // исключен бургер с говядиной
    });

    it('должен исключать товары по тегам в описании', () => {
      const query: TStructuredQuery = {
        exclusions: {
          tags: ['котлетой'],
        },
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem2]); // исключен бургер с "котлетой" в описании
    });

    it('должен исключать товары по тегам в названии ресторана', () => {
      const query: TStructuredQuery = {
        exclusions: {
          tags: ['тест'],
        },
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([]); // все товары исключены (название ресторана содержит "тест" в нижнем регистре)
    });

    it('должен исключать товары по ценовому диапазону', () => {
      const query: TStructuredQuery = {
        exclusions: {
          priceRange: { min: 400, max: 600 },
        },
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem2]); // исключен бургер в диапазоне 400-600
    });

    it('должен применять комбинированные фильтры', () => {
      const query: TStructuredQuery = {
        restaurants: ['Тест Ресторан'],
        tags: ['говядина'],
        priceRange: { min: 400, max: 600 },
        exclusions: {
          tags: ['салат'],
        },
      };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([]); // бургер исключен из-за тега "салат" в ингредиентах
    });

    it('должен возвращать все товары при пустом запросе', () => {
      const query: TStructuredQuery = {};
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const result = (service as unknown as TMockedService).filterMenuItems(allItems, query);

      expect(result).toEqual([mockMenuItem, mockMenuItem2]); // только доступные
    });
  });

  describe('buildSearchCacheKey', () => {
    it('должен генерировать стабильный ключ для простого запроса', () => {
      const query: TStructuredQuery = {
        restaurants: ['Ресторан А', 'Ресторан Б'],
        tags: ['тег1', 'тег2'],
      };
      type TMockedService = { buildSearchCacheKey: (query: TStructuredQuery, coordinates: TCoordinates) => string };
      const result = (service as unknown as TMockedService).buildSearchCacheKey(query, mockCoordinates);

      expect(result).toBe('search:58.0105,56.2294:Ресторан А,Ресторан Б|тег1,тег2|||');
    });

    it('должен генерировать ключ с ценовым диапазоном', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 100, max: 500 },
      };
      type TMockedService = { buildSearchCacheKey: (query: TStructuredQuery, coordinates: TCoordinates) => string };
      const result = (service as unknown as TMockedService).buildSearchCacheKey(query, mockCoordinates);

      expect(result).toBe('search:58.0105,56.2294:||100-500||');
    });

    it('должен генерировать ключ с исключениями', () => {
      const query: TStructuredQuery = {
        exclusions: {
          restaurants: ['Исключенный Ресторан'],
          tags: ['исключенный тег'],
          priceRange: { min: 200, max: 400 },
        },
      };
      type TMockedService = { buildSearchCacheKey: (query: TStructuredQuery, coordinates: TCoordinates) => string };
      const result = (service as unknown as TMockedService).buildSearchCacheKey(query, mockCoordinates);

      expect(result).toBe('search:58.0105,56.2294:|||Исключенный Ресторан|исключенный тег');
    });

    it('должен сортировать массивы для стабильности ключа', () => {
      const query1: TStructuredQuery = {
        restaurants: ['Б', 'А'],
        tags: ['тег2', 'тег1'],
      };
      const query2: TStructuredQuery = {
        restaurants: ['А', 'Б'],
        tags: ['тег1', 'тег2'],
      };

      type TMockedService = { buildSearchCacheKey: (query: TStructuredQuery, coordinates: TCoordinates) => string };
      const key1 = (service as unknown as TMockedService).buildSearchCacheKey(query1, mockCoordinates);
      const key2 = (service as unknown as TMockedService).buildSearchCacheKey(query2, mockCoordinates);

      expect(key1).toBe(key2);
    });

    it('должен обрабатывать пустые значения', () => {
      const query: TStructuredQuery = {};
      type TMockedService = { buildSearchCacheKey: (query: TStructuredQuery, coordinates: TCoordinates) => string };
      const result = (service as unknown as TMockedService).buildSearchCacheKey(query, mockCoordinates);

      expect(result).toBe('search:58.0105,56.2294:||||');
    });
  });

  describe('buildCacheKey', () => {
    it('должен генерировать базовый ключ', () => {
      type TMockedService = { buildCacheKey: (type: string, coordinates: TCoordinates, ...extra: string[]) => string };
      const result = (service as unknown as TMockedService).buildCacheKey('test', mockCoordinates);

      expect(result).toBe('test:58.0105,56.2294');
    });

    it('должен генерировать ключ с дополнительными параметрами', () => {
      type TMockedService = { buildCacheKey: (type: string, coordinates: TCoordinates, ...extra: string[]) => string };
      const result = (service as unknown as TMockedService).buildCacheKey('test', mockCoordinates, 'param1', 'param2');

      expect(result).toBe('test:58.0105,56.2294:param1:param2');
    });

    it('должен округлять координаты до 4 знаков', () => {
      const coordinates: TCoordinates = {
        latitude: 58.010454123,
        longitude: 56.229441789,
      };
      type TMockedService = { buildCacheKey: (type: string, coordinates: TCoordinates, ...extra: string[]) => string };
      const result = (service as unknown as TMockedService).buildCacheKey('test', coordinates);

      expect(result).toBe('test:58.0105,56.2294');
    });
  });

  describe('calculateTagRelevance', () => {
    it('должен правильно оценивать релевантность тегов', () => {
      const queryTags = ['пицца', 'томаты'];
      type TMockedService = { calculateTagRelevance: (item: TMenuItem, queryTags: string[]) => number };
      const relevance = (service as unknown as TMockedService).calculateTagRelevance(mockMenuItem2, queryTags);
      expect(relevance).toBeGreaterThan(0);
    });

    it('должен возвращать 0 для нерелевантных блюд', () => {
      const queryTags = ['пицца', 'паста'];
      type TMockedService = { calculateTagRelevance: (item: TMenuItem, queryTags: string[]) => number };
      const relevance = (service as unknown as TMockedService).calculateTagRelevance(mockMenuItem, queryTags);
      expect(relevance).toBe(0);
    });
  });

  describe('sortByRelevance', () => {
    it('должен сортировать блюда по релевантности', () => {
      const items = [mockMenuItem, mockMenuItem2];
      const query: TStructuredQuery = { tags: ['пицца'] };
      const sorted = service.sortByRelevance(items, query);
      expect(sorted[0].name).toBe('Пицца Маргарита');
    });

    it('должен учитывать цену при равной релевантности', () => {
      const pizza1 = { ...mockMenuItem2, price: 600 };
      const pizza2 = { ...mockMenuItem2, price: 400, id: 'pizza2' };
      const items = [pizza1, pizza2];
      const query: TStructuredQuery = { tags: ['пицца'] };
      const sorted = service.sortByRelevance(items, query);
      expect(sorted[0].price).toBe(400);
    });
  });

  describe('filterMenuItems', () => {
    it('должен фильтровать по тегам с улучшенной логикой', () => {
      const items = [mockMenuItem, mockMenuItem2];
      const query: TStructuredQuery = { tags: ['пицца'] };
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const filtered = (service as unknown as TMockedService).filterMenuItems(items, query);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Пицца Маргарита');
    });

    it('должен исключать недоступные блюда', () => {
      const items = [mockMenuItem3];
      const query: TStructuredQuery = {};
      type TMockedService = { filterMenuItems: (items: TMenuItem[], query: TStructuredQuery) => TMenuItem[] };
      const filtered = (service as unknown as TMockedService).filterMenuItems(items, query);
      expect(filtered).toHaveLength(0);
    });
  });
});
