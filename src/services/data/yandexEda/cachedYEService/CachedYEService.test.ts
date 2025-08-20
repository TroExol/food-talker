import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TYEMenuItem, TYERestaurantResponsed } from '@/models/yandexEda';
import type { TStructuredQuery } from '@/models/search';
import type { TCoordinates, TRestaurant } from '@/models/restaurant';
import type { TMenuItem } from '@/models/menuItem';

import { cityValidator } from '@/utils/cityValidator';
import { EAvailableCities } from '@/config/bot';

import type { YEService } from '../yeService/YEService';
import type { YEDataTransformer } from '../yeDataTransformer/YEDataTransformer';
import type { CacheService } from '../../cache/cacheService/CacheService';

import { CachedYEService } from './CachedYEService';

describe('CachedYeService', () => {
  let cachedYeService: CachedYEService;
  let mockYeService: YEService;
  let mockCacheService: CacheService;
  let mockDataTransformer: YEDataTransformer;

  const mockCoordinates: TCoordinates = cityValidator.getCityCoordinates(EAvailableCities.PERM)!;
  const mockCity: EAvailableCities = EAvailableCities.PERM;

  const mockRestaurants: TRestaurant[] = [
    {
      id: 'restaurant-1',
      name: 'Тест Ресторан',
      coordinates: mockCoordinates,
      workingHours: { open: '09:00', close: '23:00', isOpen: true },
      isActive: true,
      lastUpdated: new Date(),
    },
  ];

  const mockMenuItems: TMenuItem[] = [
    {
      id: 'item-1',
      name: 'Тест блюдо',
      description: 'Описание',
      ingredients: ['рис', 'лосось'],
      price: 500,
      available: true,
      restaurant: mockRestaurants[0],
    },
  ];

  const mockYePlaces: TYERestaurantResponsed[] = [
    {
      name: { value: 'Тест Ресторан', color: { light: '#000', dark: '#fff' } },
      slug: 'restaurant-1',
      brand: { slug: 'test-brand', name: 'Тест Бренд', business: 'restaurant' },
    },
  ];

  const mockYeMenuItems: TYEMenuItem[] = [
    {
      id: 1,
      name: 'Тест блюдо',
      description: 'Описание',
      available: true,
      inStock: true,
      price: 500,
      decimalPrice: '500',
      promoTypes: [],
      optionsGroups: [],
      adult: false,
      shippingType: 'all',
      publicId: 'test',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockYeService = {
      getRestaurants: vi.fn().mockResolvedValue(mockYePlaces),
      getRestaurantMenu: vi.fn().mockResolvedValue(mockYeMenuItems),
      searchRestaurants: vi.fn().mockResolvedValue(mockYePlaces),
      checkRateLimit: vi.fn().mockReturnValue(true),
    } as unknown as YEService;

    mockCacheService = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn().mockReturnValue(undefined),
      delete: vi.fn().mockReturnValue(undefined),
      clear: vi.fn().mockReturnValue(undefined),
      has: vi.fn().mockReturnValue(false),
      getStats: vi.fn().mockReturnValue({
        totalKeys: 10,
        memoryUsage: 1024,
        hitRate: 0.8,
        missRate: 0.2,
      }),
    } as unknown as CacheService;

    mockDataTransformer = {
      transformRestaurant: vi.fn().mockReturnValue(mockRestaurants[0]),
      transformMenuItem: vi.fn().mockReturnValue(mockMenuItems[0]),
      transformRestaurants: vi.fn().mockReturnValue(mockRestaurants),
      transformMenuItems: vi.fn().mockReturnValue(mockMenuItems),
    } as unknown as YEDataTransformer;

    cachedYeService = new CachedYEService(mockYeService, mockCacheService, mockDataTransformer);
  });

  describe('getPlaces', () => {
    it('должен вернуть данные из кэша если они есть', async () => {
      mockCacheService.get = vi.fn().mockResolvedValue(mockRestaurants);

      const result = await cachedYeService.getRestaurants(mockCity);

      expect(result).toEqual(mockRestaurants);
      expect(mockYeService.getRestaurants).not.toHaveBeenCalled();
      expect(mockCacheService.get).toHaveBeenCalledWith(`restaurants:${mockCity}:${mockCoordinates.latitude.toFixed(4)},${mockCoordinates.longitude.toFixed(4)}`);
    });

    it('должен загрузить данные из API если их нет в кэше', async () => {
      mockCacheService.get = vi.fn().mockReturnValue(null);

      const result = await cachedYeService.getRestaurants(mockCity);

      expect(result).toEqual(mockRestaurants);
      expect(mockYeService.getRestaurants).toHaveBeenCalledWith(mockCoordinates);
      expect(mockDataTransformer.transformRestaurants).toHaveBeenCalledWith(mockYePlaces, mockCoordinates);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `restaurants:${mockCity}:${mockCoordinates.latitude.toFixed(4)},${mockCoordinates.longitude.toFixed(4)}`,
        mockRestaurants,
        3600,
      );
    });

    it('должен обработать ошибку API', async () => {
      mockCacheService.get = vi.fn().mockReturnValue(null);
      mockYeService.getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

      await expect(cachedYeService.getRestaurants(mockCity))
        .rejects.toThrow('Не удалось загрузить рестораны Яндекс.Еда для Пермь');
    });
  });

  describe('getPlaceMenu', () => {
    it('должен вернуть меню из кэша если оно есть', async () => {
      mockCacheService.get = vi.fn().mockReturnValue(mockMenuItems);

      const result = await cachedYeService.getRestaurantMenu('restaurant-1', mockCity);

      expect(result).toEqual(mockMenuItems);
      expect(mockYeService.getRestaurantMenu).not.toHaveBeenCalled();
    });

    it('должен загрузить меню из API если его нет в кэше', async () => {
      // Сначала нет в кэше меню, но есть рестораны
      mockCacheService.get = vi.fn()
        .mockReturnValueOnce(null) // Нет меню в кэше
        .mockReturnValueOnce(mockRestaurants); // Есть рестораны в кэше

      const result = await cachedYeService.getRestaurantMenu('restaurant-1', mockCity);

      expect(result).toEqual(mockMenuItems);
      expect(mockYeService.getRestaurantMenu).toHaveBeenCalledWith('restaurant-1', mockCoordinates, undefined);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `menu:${mockCity}:${mockCoordinates.latitude.toFixed(4)},${mockCoordinates.longitude.toFixed(4)}:restaurant-1`,
        mockMenuItems,
        1800,
      );
    });

    it('должен обработать случай когда ресторан не найден', async () => {
      mockCacheService.get = vi.fn()
        .mockReturnValueOnce(null) // Нет меню в кэше
        .mockReturnValueOnce([]); // Нет ресторанов

      await expect(cachedYeService.getRestaurantMenu('non-existent', mockCity))
        .rejects.toThrow('Не удалось загрузить меню Яндекс.Еда для non-existent');
    });
  });

  describe('searchItems', () => {
    const mockQuery: TStructuredQuery = {
      ingredients: ['лосось'],
      priceRange: { min: 400, max: 600 },
    };

    it('должен вернуть результаты поиска из кэша', async () => {
      mockCacheService.get = vi.fn().mockReturnValue(mockMenuItems);

      const result = await cachedYeService.searchItems(mockQuery, mockCity);

      expect(result).toEqual(mockMenuItems);
      expect(mockYeService.getRestaurants).not.toHaveBeenCalled();
    });

    it('должен выполнить поиск и закэшировать результаты', async () => {
      // Кэш поиска пуст, но есть кэшированные рестораны
      mockCacheService.get = vi.fn()
        .mockReturnValueOnce(null) // Нет результатов поиска
        .mockReturnValueOnce(mockRestaurants); // Есть рестораны

      // Меню для ресторана
      mockCacheService.get = vi.fn()
        .mockReturnValueOnce(null) // Нет поиска в кэше
        .mockReturnValueOnce(mockRestaurants) // Рестораны в кэше
        .mockReturnValueOnce(mockMenuItems); // Меню в кэше

      const result = await cachedYeService.searchItems(mockQuery, mockCity);

      expect(result).toEqual(mockMenuItems);
      expect(mockCacheService.set).toHaveBeenCalled(); // Кэшируем результат поиска
    });

    it('должен фильтровать элементы меню по запросу', async () => {
      const unfilteredItems: TMenuItem[] = [
        {
          ...mockMenuItems[0],
          ingredients: ['лосось', 'рис'], // Подходит
          price: 500,
        },
        {
          ...mockMenuItems[0],
          id: 'item-2',
          ingredients: ['курица', 'овощи'], // Не подходит по ингредиентам
          price: 400,
        },
        {
          ...mockMenuItems[0],
          id: 'item-3',
          ingredients: ['лосось', 'икра'], // Подходит по ингредиентам
          price: 700, // Не подходит по цене
        },
      ];

      mockCacheService.get = vi.fn()
        .mockReturnValueOnce(null) // Нет поиска в кэше
        .mockReturnValueOnce(mockRestaurants) // Рестораны в кэше
        .mockReturnValueOnce(unfilteredItems); // Меню в кэше

      const result = await cachedYeService.searchItems(mockQuery, mockCity);

      // Должен остаться только первый элемент (подходит по ингредиентам и цене)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('item-1');
    });
  });

  describe('cache management', () => {
    it('должен инвалидировать кэш', async () => {
      await cachedYeService.invalidateCache();
      expect(mockCacheService.clear).toHaveBeenCalled();
    });

    it('должен вернуть статистику кэша', async () => {
      const stats = await cachedYeService.getCacheStats();

      expect(stats).toEqual({
        restaurants: 1, // 10% от 10 ключей
        menus: 7, // 70% от 10 ключей
        searches: 2, // 20% от 10 ключей
      });
    });
  });

  describe('cache key generation', () => {
    it('должен генерировать стабильные ключи для поиска', async () => {
      const query1: TStructuredQuery = {
        ingredients: ['лосось', 'рис'],
        restaurants: ['KFC', 'Burger King'],
      };

      const query2: TStructuredQuery = {
        restaurants: ['Burger King', 'KFC'], // Другой порядок
        ingredients: ['рис', 'лосось'], // Другой порядок
      };

      // Мокаем для перехвата ключей кэша
      const setCalls: string[] = [];
      mockCacheService.set = vi.fn().mockImplementation((key: string) => {
        setCalls.push(key);
        return undefined;
      });

      mockCacheService.get = vi.fn().mockReturnValue(null);

      await cachedYeService.searchItems(query1, mockCity);
      await cachedYeService.searchItems(query2, mockCity);

      // Ключи должны быть одинаковыми (порядок нормализован)
      expect(setCalls[0]).toBe(setCalls[1]);
    });
  });
});
