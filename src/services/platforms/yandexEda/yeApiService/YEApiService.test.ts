import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TCoordinates } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';
import type {
  TYEMenuFromServer,
  TYEMenuItemFromServer,
  TYERestaurant,
  TYERestaurantFromServer,
  TYERestaurantsFromServer,
} from '@/services/platforms/yandexEda/yeApiService/types';
import type { CacheService } from '@/services/cacheService/CacheService';

import { CityValidator } from '@/utils/CityValidator';
import { AppError } from '@/utils/AppError';
import { EAvailableCities } from '@/config/bot/types';

import type { YEDataTransformer } from '../yeDataTransformer/YEDataTransformer';

import { YEApiService } from './YEApiService';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('YEApiService', () => {
  let service: YEApiService;
  const mockCoordinates: TCoordinates = {
    latitude: 58.010454,
    longitude: 56.229441,
  };

  beforeEach(() => {
    const mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      getStats: vi.fn(),
    } as unknown as CacheService;

    const mockDataTransformer = {
      transformRestaurant: vi.fn(),
      transformMenuItem: vi.fn(),
      transformRestaurants: vi.fn(),
      transformMenuItems: vi.fn(),
      transformMenu: vi.fn(),
    } as unknown as YEDataTransformer;

    service = new YEApiService(mockCacheService, mockDataTransformer);
    (service as any).config.delayBetweenRequestsMs = 0;
  });

  describe('requestRestaurants', () => {
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
      (service as any).config.delayBetweenRequestsMs = 0; // Отключаем задержку для теста

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
      (service as any).config.retries = 0;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
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
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();
      const result = await sendingRequest;

      expect(result).toEqual([mockPlace]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('requestRestaurantMenu', () => {
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

      await service.requestRestaurantMenu('test-place', mockCoordinates, '');

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
      (service as any).config.retries = 0;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.requestRestaurantMenu('test-place', mockCoordinates, 'test-brand')).rejects.toThrow(AppError);
    });
  });

  describe('checkRateLimit', () => {
    it('должен разрешить запрос в рамках лимита', () => {
      const canMakeRequest = service.checkRateLimit();

      expect(canMakeRequest).toBe(true);
    });

    it('должен запретить запрос при превышении лимита', () => {
      (service as any).config.rateLimits.requestsPerMinute = 2;

      // Имитируем множество запросов
      (service as unknown as { enforceRateLimit: () => void }).enforceRateLimit();
      (service as unknown as { enforceRateLimit: () => void }).enforceRateLimit();

      const canMakeRequest = service.checkRateLimit();
      expect(canMakeRequest).toBe(false);
    });
  });

  describe('rate limiting enforcement', () => {
    it('должен ждать при превышении rate limit', async () => {
      (service as any).config.rateLimits.requestsPerMinute = 1;
      (service as any).config.delayBetweenRequestsMs = 0;

      // Первый запрос должен пройти
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { places_v2_lists: [] } }),
      });

      const firstRequest = service.requestRestaurants(mockCoordinates);
      await vi.runAllTimersAsync();
      await firstRequest;

      // Второй запрос должен ждать из-за rate limit
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
      (service as any).config.delayBetweenRequestsMs = 200;

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

  describe('cached methods', () => {
    const mockCity: EAvailableCities = EAvailableCities.PERM;
    const mockCoordinates: TCoordinates = {
      latitude: 58.010454,
      longitude: 56.229441,
    };

    const mockYeRestaurant: TYERestaurantFromServer = {
      name: { value: 'Тест Ресторан', color: { light: '#000', dark: '#fff' } },
      slug: 'test-restaurant',
      brand: { slug: 'test-brand', name: 'Тест Бренд', business: 'restaurant' },
    };

    const mockYeRestaurants: TYERestaurantFromServer[] = [mockYeRestaurant];

    const mockYeMenuItems: TYEMenuItemFromServer[] = [
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
    ];

    const mockTransformedRestaurant: TYERestaurant = {
      id: 'test-restaurant',
      name: 'Тест Ресторан',
      coordinates: mockCoordinates,
      lastUpdated: new Date(),
      additionalInfo: {
        brandSlug: 'test-brand',
      },
    };

    const mockTransformedMenuItems: TMenuItem[] = [
      {
        id: '123',
        name: 'Тестовое блюдо',
        description: 'Описание',
        ingredients: [],
        price: 500,
        available: true,
        restaurant: mockTransformedRestaurant,
        orderUrl: 'https://eda.yandex.ru/r/test-brand?placeSlug=test-restaurant',
      },
    ];

    let mockCacheService: CacheService;
    let mockDataTransformer: YEDataTransformer;

    beforeEach(() => {
      vi.spyOn(CityValidator, 'getCityCoordinates').mockReturnValue(mockCoordinates);

      // Мокаем внутренние методы сервиса
      (service as any).requestRestaurants = vi.fn();
      (service as any).getRestaurantById = vi.fn();
      (service as any).requestRestaurantMenu = vi.fn();
      (service as any).buildCacheKey = vi.fn();

      // Создаем моки для сервиса
      mockCacheService = {
        get: vi.fn(),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        has: vi.fn().mockReturnValue(false),
        getStats: vi.fn().mockResolvedValue({
          totalKeys: 10,
          memoryUsage: 1024,
          hitRate: 0.8,
          missRate: 0.2,
        }),
      } as unknown as CacheService;

      mockDataTransformer = {
        transformRestaurant: vi.fn(),
        transformMenuItem: vi.fn(),
        transformRestaurants: vi.fn().mockReturnValue([mockTransformedRestaurant]),
        transformMenuItems: vi.fn(),
        transformMenu: vi.fn().mockReturnValue(mockTransformedMenuItems),
      } as unknown as YEDataTransformer;

      service = new YEApiService(mockCacheService, mockDataTransformer);
      (service as any).config.delayBetweenRequestsMs = 0;
    });

    describe('getRestaurants', () => {
      it('должен вернуть данные из кэша если они есть', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue([mockTransformedRestaurant]);

        const result = await service.getRestaurants(mockCity);

        expect(result).toEqual([mockTransformedRestaurant]);
        expect(mockCacheService.get).toHaveBeenCalledWith('restaurants:58.0105,56.2294');
        expect(mockDataTransformer.transformRestaurants).not.toHaveBeenCalled();
        expect(mockCacheService.set).not.toHaveBeenCalled();
      });

      it('должен загрузить данные из API если их нет в кэше', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);

        // Мокаем requestRestaurants
        (service as any).requestRestaurants = vi.fn().mockResolvedValue(mockYeRestaurants);

        const result = await service.getRestaurants(mockCity);

        expect(result).toEqual([mockTransformedRestaurant]);
        expect(mockCacheService.get).toHaveBeenCalledWith('restaurants:58.0105,56.2294');
        expect((service as any).requestRestaurants).toHaveBeenCalledWith(mockCoordinates);
        expect(mockDataTransformer.transformRestaurants).toHaveBeenCalledWith(mockYeRestaurants, mockCoordinates);
        expect(mockCacheService.set).toHaveBeenCalledWith(
          'restaurants:58.0105,56.2294',
          [mockTransformedRestaurant],
          3600,
        );
      });

      it('должен обработать ошибку API', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);
        (service as any).requestRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

        await expect(service.getRestaurants(mockCity)).rejects.toThrow('Не удалось загрузить рестораны Яндекс.Еда для Пермь');
        expect(mockCacheService.get).toHaveBeenCalledWith('restaurants:58.0105,56.2294');
      });

      it('должен обработать ошибку получения координат', async () => {
        vi.spyOn(CityValidator, 'getCityCoordinates').mockReturnValue(null);

        await expect(service.getRestaurants(mockCity)).rejects.toThrow('Не удалось получить координаты для города Пермь Яндекс.Еда');
      });
    });

    describe('getRestaurantMenu', () => {
      it('должен вернуть меню из кэша если оно есть', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(mockTransformedMenuItems);

        const result = await service.getRestaurantMenu('test-restaurant', mockCity);

        expect(result).toEqual(mockTransformedMenuItems);
        expect(mockCacheService.get).toHaveBeenCalledWith('menu:58.0105,56.2294:test-restaurant');
        expect(mockDataTransformer.transformMenu).not.toHaveBeenCalled();
        expect(mockCacheService.set).not.toHaveBeenCalled();
      });

      it('должен загрузить меню из API если его нет в кэше', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);

        // Мокаем внутренние методы
        (service as any).getRestaurantById = vi.fn().mockResolvedValue(mockTransformedRestaurant);
        (service as any).requestRestaurantMenu = vi.fn().mockResolvedValue(mockYeMenuItems);

        const result = await service.getRestaurantMenu('test-restaurant', mockCity);

        expect(result).toEqual(mockTransformedMenuItems);
        expect(mockCacheService.get).toHaveBeenCalledWith('menu:58.0105,56.2294:test-restaurant');
        expect((service as any).getRestaurantById).toHaveBeenCalledWith('test-restaurant', mockCity);
        expect((service as any).requestRestaurantMenu).toHaveBeenCalledWith('test-restaurant', mockCoordinates, 'test-brand');
        expect(mockDataTransformer.transformMenu).toHaveBeenCalledWith(mockYeMenuItems, mockTransformedRestaurant);
        expect(mockCacheService.set).toHaveBeenCalledWith(
          'menu:58.0105,56.2294:test-restaurant',
          mockTransformedMenuItems,
          1800,
        );
      });

      it('должен обработать случай когда ресторан не найден', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);
        (service as any).getRestaurantById = vi.fn().mockResolvedValue(null);

        await expect(service.getRestaurantMenu('non-existent', mockCity)).rejects.toThrow('Не удалось загрузить меню Яндекс.Еда для non-existent');
      });

      it('должен обработать ошибку получения координат', async () => {
        vi.spyOn(CityValidator, 'getCityCoordinates').mockReturnValue(null);

        await expect(service.getRestaurantMenu('test-restaurant', mockCity)).rejects.toThrow('Не удалось получить координаты для города Пермь Яндекс.Еда');
      });
    });

    describe('getRestaurantById', () => {
      it('должен найти ресторан по ID', async () => {
        // Мокаем getRestaurants
        (service as any).getRestaurants = vi.fn().mockResolvedValue([mockTransformedRestaurant]);

        const result = await service.getRestaurantById('test-restaurant', mockCity);

        expect(result).toEqual(mockTransformedRestaurant);
        expect((service as any).getRestaurants).toHaveBeenCalledWith(mockCity);
      });

      it('должен вернуть null если ресторан не найден', async () => {
        (service as any).getRestaurants = vi.fn().mockResolvedValue([mockTransformedRestaurant]);

        const result = await service.getRestaurantById('non-existent', mockCity);

        expect(result).toBeNull();
      });

      it('должен вернуть null при ошибке получения ресторанов', async () => {
        (service as any).getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

        const result = await service.getRestaurantById('test-restaurant', mockCity);

        expect(result).toBeNull();
      });
    });

    describe('buildCacheKey', () => {
      it('должен генерировать правильный ключ для ресторанов', () => {
        type TestService = { buildCacheKey: (type: string, coordinates: TCoordinates, ...extra: string[]) => string };
        const key = (service as unknown as TestService).buildCacheKey('restaurants', mockCoordinates);
        expect(key).toBe('restaurants:58.0105,56.2294');
      });

      it('должен генерировать правильный ключ для меню', () => {
        type TestService = { buildCacheKey: (type: string, coordinates: TCoordinates, ...extra: string[]) => string };
        const key = (service as unknown as TestService).buildCacheKey('menu', mockCoordinates, 'restaurant-id');
        expect(key).toBe('menu:58.0105,56.2294:restaurant-id');
      });

      it('должен генерировать правильный ключ с множеством дополнительных параметров', () => {
        type TestService = { buildCacheKey: (type: string, coordinates: TCoordinates, ...extra: string[]) => string };
        const key = (service as unknown as TestService).buildCacheKey('search', mockCoordinates, 'query', 'param1', 'param2');
        expect(key).toBe('search:58.0105,56.2294:query:param1:param2');
      });
    });

    it('должен очистить кэш', async () => {
      const mockCacheService = {
        clear: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        has: vi.fn(),
        getStats: vi.fn(),
      } as unknown as CacheService;

      const mockDataTransformer = {
        transformRestaurant: vi.fn(),
        transformMenuItem: vi.fn(),
        transformRestaurants: vi.fn(),
        transformMenuItems: vi.fn(),
        transformMenu: vi.fn(),
      } as unknown as YEDataTransformer;

      const service = new YEApiService(mockCacheService, mockDataTransformer);

      await service.clearCache();
      expect(mockCacheService.clear).toHaveBeenCalled();
    });

    it('должен вернуть статистику кэша', async () => {
      const mockCacheService = {
        getStats: vi.fn().mockResolvedValue({
          totalKeys: 10,
          memoryUsage: 1024,
          hitRate: 0.8,
          missRate: 0.2,
        }),
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        has: vi.fn(),
        clear: vi.fn(),
      } as unknown as CacheService;

      const mockDataTransformer = {
        transformRestaurant: vi.fn(),
        transformMenuItem: vi.fn(),
        transformRestaurants: vi.fn(),
        transformMenuItems: vi.fn(),
        transformMenu: vi.fn(),
      } as unknown as YEDataTransformer;

      const service = new YEApiService(mockCacheService, mockDataTransformer);

      const stats = await service.getCacheStats();

      expect(stats).toEqual({
        restaurants: 1, // 10% от 10 ключей
        menus: 9, // 90% ключей - меню
      });
    });
  });
});
