import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  vitest,
} from 'vitest';

import type {
  TYEMenuResponse,
  TYERestaurantResponsed,
  TYERestaurantsResponse,
} from '@/models/yandexEda';
import type { TStructuredQuery } from '@/models/search';
import type { TCoordinates } from '@/models/restaurant';

import { AppError } from '@/utils/errors';

import { YEService } from '../yeService';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('YandexEdaService', () => {
  let service: YEService;
  const mockCoordinates: TCoordinates = {
    latitude: 58.010454,
    longitude: 56.229441,
  };

  beforeEach(() => {
    service = new YEService();
  });

  describe('getPlaces', () => {
    const mockPlace: TYERestaurantResponsed = {
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

    const mockResponse: TYERestaurantsResponse = {
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getRestaurants(mockCoordinates);

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

      const result = await service.getRestaurants(mockCoordinates);

      expect(result).toEqual([]);
    });

    it('должен выбросить ошибку при неудачном запросе', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      const service = new YEService({
        retries: 0,
      });

      await expect(service.getRestaurants(mockCoordinates)).rejects.toThrow(AppError);
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

      const sendingRequest = service.getRestaurants(mockCoordinates);
      await vitest.advanceTimersToNextTimerAsync();
      await vitest.advanceTimersToNextTimerAsync();
      await vitest.advanceTimersToNextTimerAsync();
      const result = await sendingRequest;

      expect(result).toEqual([mockPlace]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getPlaceMenu', () => {
    const mockMenuResponse: TYEMenuResponse = {
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

      const result = await service.getRestaurantMenu('test-place', mockCoordinates, 'test-brand');

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

      await service.getRestaurantMenu('test-place', mockCoordinates);

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
      const service = new YEService({
        retries: 0,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.getRestaurantMenu('test-place', mockCoordinates)).rejects.toThrow(AppError);
    });
  });

  describe('searchItems', () => {
    const mockPlace: TYERestaurantResponsed = {
      name: { value: 'Додо Пицца', color: { light: '#000', dark: '#fff' } },
      slug: 'dodo-pizza',
      brand: { slug: 'dodo', name: 'Додо', business: 'restaurant' },
    };

    const mockResponse: TYERestaurantsResponse = {
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
      const service = new YEService({
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
    it('должен выбросить ошибку при превышении rate limit', async () => {
      const service = new YEService({
        rateLimits: {
          requestsPerMinute: 1,
          requestsPerHour: 100,
          windowSizeMs: 60000,
        },
      });

      // Первый запрос должен пройти
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { places_v2_lists: [] } }),
      });

      await service.getRestaurants(mockCoordinates);

      // Второй запрос должен быть заблокирован
      await expect(service.getRestaurants(mockCoordinates)).rejects.toThrow(
        expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
        }) as AppError,
      );
    });
  });
});
