import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  vitest,
} from 'vitest';

import type { TStructuredQuery } from '@/types/search';
import type { TCoordinates } from '@/types/restaurant';
import type {
  TYEMenuFromServer,
  TYERestaurantFromServer,
  TYERestaurantsFromServer,
} from '@/services/platforms/yandexEda/yeApiService/types';

import { AppError } from '@/utils/AppError';

import { YEApiService } from './YEApiService';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('YandexEdaService', () => {
  let service: YEApiService;
  const mockCoordinates: TCoordinates = {
    latitude: 58.010454,
    longitude: 56.229441,
  };

  beforeEach(() => {
    service = new YEApiService({ delayBetweenRequestsMs: 0 });
  });

  describe('getPlaces', () => {
    const mockPlace: TYERestaurantFromServer = {
      name: { value: 'Тест Ресторан', color: { light: '#000', dark: '#fff' } },
      slug: 'test-restaurant',
      brand: { slug: 'test-brand', name: 'Тест Бренд', business: 'restaurant' },
      features: {
        rating: {
          text: { value: '4.5', color: { light: '#000', dark: '#fff' } },
          icon: { url: 'https://example.com/icon.png' },
        },
      },
    };

    const mockResponse: TYERestaurantsFromServer = {
      data: {
        places_v2_lists: [
          {
            payload: {
              places: [mockPlace],
            },
          },
        ],
      },
    };

    it('должен успешно получить список мест', async () => {
      const service = new YEApiService({ delayBetweenRequestsMs: 0 }); // Отключаем задержку для теста

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.requestRestaurants(mockCoordinates);

      expect(result).toEqual([mockPlace]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://eda.yandex.ru/eats/v1/layout-constructor/v1/layout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-retpath-y': 'https://eda.yandex.ru/perm?shippingType=delivery',
          }) as object,
          body: JSON.stringify({ location: mockCoordinates }),
        }),
      );
    });

    it('должен вернуть пустой массив если нет данных', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      const result = await service.requestRestaurants(mockCoordinates);

      expect(result).toEqual([]);
    });

    it('должен выбросить ошибку при неудачном запросе', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      const service = new YEApiService({
        delayBetweenRequestsMs: 0,
        retries: 0,
      });

      await expect(service.requestRestaurants(mockCoordinates)).rejects.toThrow(AppError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('должен повторить запрос при ошибке сети', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

      const sendingRequest = service.requestRestaurants(mockCoordinates);
      await vitest.advanceTimersToNextTimerAsync();
      await vitest.advanceTimersToNextTimerAsync();
      await vitest.advanceTimersToNextTimerAsync();
      const result = await sendingRequest;

      expect(result).toEqual([mockPlace]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getPlaceMenu', () => {
    const mockMenuResponse: TYEMenuFromServer = {
      payload: {
        categories: [
          {
            id: 1,
            name: 'Основные блюда',
            available: true,
            items: [
              {
                id: 123,
                name: 'Тестовое блюдо',
                description: 'Описание',
                available: true,
                inStock: true,
                price: 500,
                decimalPrice: '500',
                promoTypes: [],
                optionsGroups: [],
                adult: false,
                shippingType: 'all',
                publicId: 'test-id',
              },
            ],
            gallery: [],
            categories: [],
          },
        ],
      },
    };

    it('должен успешно получить меню ресторана', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMenuResponse),
      });

      const result = await service.requestRestaurantMenu('test-place', mockCoordinates, 'test-brand');

      expect(result).toEqual(mockMenuResponse.payload.categories.flatMap(category => category.items));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/menu/retrieve/test-place'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-retpath-y': 'https://eda.yandex.ru/r/test-brand?placeSlug=test-place',
          }) as object,
        }),
      );
    });

    it('должен использовать placeSlug как retpath если brandSlug не указан', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMenuResponse),
      });

      await service.requestRestaurantMenu('test-place', mockCoordinates);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/menu/retrieve/test-place'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-retpath-y': 'https://eda.yandex.ru/r/test-place',
          }) as object,
        }),
      );
    });

    it('должен выбросить ошибку при неудачном запросе меню', async () => {
      const service = new YEApiService({
        delayBetweenRequestsMs: 0,
        retries: 0,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.requestRestaurantMenu('test-place', mockCoordinates)).rejects.toThrow(AppError);
    });
  });

  describe('searchItems', () => {
    const mockPlace: TYERestaurantFromServer = {
      name: { value: 'Додо Пицца', color: { light: '#000', dark: '#fff' } },
      slug: 'dodo-pizza',
      brand: { slug: 'dodo', name: 'Додо', business: 'restaurant' },
    };

    const mockResponse: TYERestaurantsFromServer = {
      data: {
        places_v2_lists: [
          {
            payload: {
              places: [mockPlace],
            },
          },
        ],
      },
    };

    it('должен фильтровать места по названию ресторана', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const query: TStructuredQuery = {
        restaurants: ['Додо'],
      };

      const result = await service.searchRestaurants(query, mockCoordinates);

      expect(result).toEqual([mockPlace]);
    });

    it('должен вернуть все места если фильтры не указаны', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const query: TStructuredQuery = {};

      const result = await service.searchRestaurants(query, mockCoordinates);

      expect(result).toEqual([mockPlace]);
    });

    it('должен вернуть пустой массив если нет совпадений', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const query: TStructuredQuery = {
        restaurants: ['Несуществующий ресторан'],
      };

      const result = await service.searchRestaurants(query, mockCoordinates);

      expect(result).toEqual([]);
    });
  });

  describe('checkRateLimit', () => {
    it('должен разрешить запрос в рамках лимита', () => {
      const canMakeRequest = service.checkRateLimit();

      expect(canMakeRequest).toBe(true);
    });

    it('должен запретить запрос при превышении лимита', () => {
      // Имитируем множество запросов
      const service = new YEApiService({
        rateLimits: {
          requestsPerMinute: 2,
          requestsPerHour: 100,
          windowSizeMs: 60000,
        },
      });

      // Делаем максимальное количество разрешенных запросов
      (service as unknown as { enforceRateLimit: () => void }).enforceRateLimit();
      (service as unknown as { enforceRateLimit: () => void }).enforceRateLimit();

      const canMakeRequest = service.checkRateLimit();
      expect(canMakeRequest).toBe(false);
    });
  });

  describe('rate limiting enforcement', () => {
    it('должен ждать при превышении rate limit', async () => {
      const service = new YEApiService({
        rateLimits: {
          requestsPerMinute: 1,
          requestsPerHour: 100,
          windowSizeMs: 60000,
        },
        delayBetweenRequestsMs: 0, // Отключаем задержку для теста
      });

      // Первый запрос должен пройти
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { places_v2_lists: [] } }),
      });

      const firstRequest = service.requestRestaurants(mockCoordinates);
      await vi.runAllTimersAsync();
      await firstRequest;

      // Второй запрос должен ждать
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { places_v2_lists: [] } }),
      });

      const secondRequest = service.requestRestaurants(mockCoordinates);

      // Продвигаем время на 60 секунд (windowSizeMs)
      vi.advanceTimersByTime(60000);
      await vi.runAllTimersAsync();

      await secondRequest; // Должен завершиться без ошибки

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('должен применять задержку между запросами', async () => {
      const service = new YEApiService({
        delayBetweenRequestsMs: 200, // 200ms задержка
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { places_v2_lists: [] } }),
      });

      const firstRequest = service.requestRestaurants(mockCoordinates);
      await vi.runAllTimersAsync();
      await firstRequest;

      const secondRequest = service.requestRestaurants(mockCoordinates);
      // Продвигаем время на 200ms для задержки
      vi.advanceTimersByTime(200);
      await secondRequest;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('должен обрабатывать пустой массив запросов', async () => {
      const service = new YEApiService({
        rateLimits: {
          requestsPerMinute: 1,
          requestsPerHour: 100,
          windowSizeMs: 60000,
        },
        delayBetweenRequestsMs: 0,
      });

      // Симулируем пустой массив запросов
      (service as any).rateLimitState.requests = [];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { places_v2_lists: [] } }),
      });

      const result = await service.requestRestaurants(mockCoordinates);

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('CachedYeService', () => {
    let cachedYeService: CachedYEService;
    let mockYeService: YEApiService;
    let mockCacheService: CacheService;
    let mockDataTransformer: YEDataTransformer;

    const mockCoordinates: TCoordinates = cityValidator.getCityCoordinates(EAvailableCities.PERM);
    const mockCity: EAvailableCities = EAvailableCities.PERM;

    const mockRestaurants: TRestaurant[] = [
      {
        id: 'restaurant-1',
        name: 'Тест Ресторан',
        coordinates: mockCoordinates,
        workingHours: { open: '09:00', close: '23:00', isOpen: true },
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

    const mockYePlaces: TYERestaurantFromServer[] = [
      {
        name: { value: 'Тест Ресторан', color: { light: '#000', dark: '#fff' } },
        slug: 'restaurant-1',
        brand: { slug: 'test-brand', name: 'Тест Бренд', business: 'restaurant' },
      },
    ];

    const mockYeMenuItems: TYEMenuItemFromServer[] = [
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
      } as unknown as YEApiService;

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
        expect(mockYeService.requestRestaurants).not.toHaveBeenCalled();
        expect(mockCacheService.get).toHaveBeenCalledWith(`restaurants:${mockCity}:${mockCoordinates.latitude.toFixed(4)},${mockCoordinates.longitude.toFixed(4)}`);
      });

      it('должен загрузить данные из API если их нет в кэше', async () => {
        mockCacheService.get = vi.fn().mockReturnValue(null);

        const result = await cachedYeService.getRestaurants(mockCity);

        expect(result).toEqual(mockRestaurants);
        expect(mockYeService.requestRestaurants).toHaveBeenCalledWith(mockCoordinates);
        expect(mockDataTransformer.transformRestaurants).toHaveBeenCalledWith(mockYePlaces, mockCoordinates);
        expect(mockCacheService.set).toHaveBeenCalledWith(
          `restaurants:${mockCity}:${mockCoordinates.latitude.toFixed(4)},${mockCoordinates.longitude.toFixed(4)}`,
          mockRestaurants,
          3600,
        );
      });

      it('должен обработать ошибку API', async () => {
        mockCacheService.get = vi.fn().mockReturnValue(null);
        mockYeService.requestRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

        await expect(cachedYeService.getRestaurants(mockCity))
          .rejects.toThrow('Не удалось загрузить рестораны Яндекс.Еда для Пермь');
      });
    });

    describe('getPlaceMenu', () => {
      it('должен вернуть меню из кэша если оно есть', async () => {
        mockCacheService.get = vi.fn().mockReturnValue(mockMenuItems);

        const result = await cachedYeService.getRestaurantMenu('restaurant-1', mockCity);

        expect(result).toEqual(mockMenuItems);
        expect(mockYeService.requestRestaurantMenu).not.toHaveBeenCalled();
      });

      it('должен загрузить меню из API если его нет в кэше', async () => {
      // Сначала нет в кэше меню, но есть рестораны
        mockCacheService.get = vi.fn()
          .mockReturnValueOnce(null) // Нет меню в кэше
          .mockReturnValueOnce(mockRestaurants); // Есть рестораны в кэше

        const result = await cachedYeService.getRestaurantMenu('restaurant-1', mockCity);

        expect(result).toEqual(mockMenuItems);
        expect(mockYeService.requestRestaurantMenu).toHaveBeenCalledWith('restaurant-1', mockCoordinates, undefined);
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
        tags: ['лосось'],
        priceRange: { min: 400, max: 600 },
      };

      it('должен вернуть результаты поиска из кэша', async () => {
        mockCacheService.get = vi.fn().mockReturnValue(mockMenuItems);

        const result = await cachedYeService.searchMenuItems(mockQuery, mockCity);

        expect(result).toEqual(mockMenuItems);
        expect(mockYeService.requestRestaurants).not.toHaveBeenCalled();
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

        const result = await cachedYeService.searchMenuItems(mockQuery, mockCity);

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

        const result = await cachedYeService.searchMenuItems(mockQuery, mockCity);

        // Должен остаться только первый элемент (подходит по ингредиентам и цене)
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('item-1');
      });
    });

    describe('cache management', () => {
      it('должен инвалидировать кэш', async () => {
        await cachedYeService.clearCache();
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
          tags: ['лосось', 'рис'],
          restaurants: ['KFC', 'Burger King'],
        };

        const query2: TStructuredQuery = {
          restaurants: ['Burger King', 'KFC'], // Другой порядок
          tags: ['рис', 'лосось'], // Другой порядок
        };

        // Мокаем для перехвата ключей кэша
        const setCalls: string[] = [];
        mockCacheService.set = vi.fn().mockImplementation((key: string) => {
          setCalls.push(key);
          return undefined;
        });

        mockCacheService.get = vi.fn().mockReturnValue(null);

        await cachedYeService.searchMenuItems(query1, mockCity);
        await cachedYeService.searchMenuItems(query2, mockCity);

        // Ключи должны быть одинаковыми (порядок нормализован)
        expect(setCalls[0]).toBe(setCalls[1]);
      });
    });
  });
});
