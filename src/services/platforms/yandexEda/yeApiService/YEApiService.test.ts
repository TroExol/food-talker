import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TCoordinates } from '@/types/restaurant';
import type {
  TYEMenuFromServer,
  TYERestaurantFromServer,
  TYERestaurantsFromServer,
} from '@/services/platforms/yandexEda/yeApiService/types';
import type { CacheService } from '@/services/cacheService/CacheService';

import { AppError } from '@/utils/AppError';

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

  describe('cache management', () => {
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
