import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TRestaurant } from '@/types/restaurant';

import { EDishCategory, type TMenuItem } from '@/types/menuItem';
import { EAvailableCities } from '@/config/bot/types';

import type { YEDataTransformer } from '../yeDataTransformer/YEDataTransformer';
import type { YEApiService } from '../yeApiService/YEApiService';

import { YEDataCollectionService } from './YEDataCollectionService';

// Мокаем cityValidator
vi.mock('@/utils/CityValidator', () => ({
  CityValidator: {
    getCityCoordinates: vi.fn().mockReturnValue({ latitude: 58.01, longitude: 56.23 }),
  },
}));

describe('YEDataCollectionService', () => {
  let dataCollectionService: YEDataCollectionService;
  let mockCachedYEService: YEApiService;
  let mockYEDataTransformer: YEDataTransformer;

  const mockRestaurants: TRestaurant[] = [
    {
      id: 'restaurant-1',
      name: 'Тест Ресторан 1',
      coordinates: { latitude: 58.01, longitude: 56.23 },
      lastUpdated: new Date(),
      additionalInfo: {
        brandSlug: 'brand-restaurant-1',
      },
    },
  ];

  const mockMenuItems: TMenuItem[] = [
    {
      id: 'item-1',
      name: 'Тест блюдо 1',
      description: 'Описание блюда',
      ingredients: ['рис', 'лосось'],
      price: 500,
      available: true,
      restaurant: mockRestaurants[0],
      image: 'https://example.com/image.jpg',
      orderUrl: 'https://example.com/order',
      category: EDishCategory.MAIN,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockCachedYEService = {
      requestRestaurants: vi.fn().mockResolvedValue(mockRestaurants),
      getRestaurants: vi.fn().mockResolvedValue(mockRestaurants),
      requestRestaurantMenu: vi.fn().mockResolvedValue(mockMenuItems),
      getRestaurantMenu: vi.fn().mockResolvedValue(mockMenuItems),
      getRestaurantById: vi.fn().mockResolvedValue(mockRestaurants[0]),
      getCacheStats: vi.fn().mockResolvedValue({
        restaurants: 5,
        menus: 25,
      }),
    } as unknown as YEApiService;

    mockYEDataTransformer = {
      transformRestaurant: vi.fn().mockResolvedValue(mockRestaurants[0]),
      transformMenu: vi.fn().mockResolvedValue(mockMenuItems),
      transformRestaurants: vi.fn().mockResolvedValue(mockRestaurants),
      transformMenuItem: vi.fn().mockResolvedValue(mockMenuItems[0]),
    } as unknown as YEDataTransformer;

    dataCollectionService = new YEDataCollectionService(
      mockCachedYEService,
      mockYEDataTransformer,
    );
  });

  describe('updateRestaurants', () => {
    it('должен обновить данные для всех городов', async () => {
      void dataCollectionService.updateRestaurants();
      await vi.runAllTimersAsync();

      // В конфигурации 3 города
      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledTimes(3);
    });

    it('должен обработать ошибку API', async () => {
      mockCachedYEService.getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

      // Проверяем, что функция не выбрасывает ошибку
      await expect(dataCollectionService.updateRestaurants()).resolves.toBeUndefined();
    });
  });

  describe('updateRestaurantMenu', () => {
    it('должен обновить меню ресторана', async () => {
      await dataCollectionService.updateRestaurantMenu('restaurant-1', EAvailableCities.PERM);

      expect(mockCachedYEService.getRestaurantMenu).toHaveBeenCalledWith('restaurant-1', EAvailableCities.PERM, false);
    });

    it('должен обработать ошибку загрузки меню', async () => {
      mockCachedYEService.getRestaurantMenu = vi.fn().mockRejectedValue(new Error('Menu API Error'));

      await expect(dataCollectionService.updateRestaurantMenu('restaurant-1', 'Пермь' as EAvailableCities))
        .rejects.toThrow('Не удалось обновить меню для restaurant-1 Яндекс.Еда');
    });
  });

  describe('getCollectionStats', () => {
    it('должен вернуть статистику сбора данных', async () => {
      const stats = await dataCollectionService.getCollectionStats();

      expect(stats).toEqual({
        lastUpdateTime: null, // Еще не было обновлений
        totalRestaurants: 5,
        totalMenuItems: 25,
        errors: 0,
      });
    });

    it('должен учитывать ошибки в статистике', async () => {
      // Вызываем ошибку
      mockCachedYEService.getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

      try {
        await dataCollectionService.updateRestaurants();
      } catch {
        // Игнорируем ошибку
      }

      const stats = await dataCollectionService.getCollectionStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('updateCityRestaurants', () => {
    it('должен обновить данные ресторанов для города', async () => {
      await dataCollectionService.updateCityRestaurants(EAvailableCities.PERM);

      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledWith(EAvailableCities.PERM, false);
    });

    it('должен обработать ошибку при обновлении города', async () => {
      mockCachedYEService.getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

      await expect(dataCollectionService.updateCityRestaurants(EAvailableCities.PERM)).rejects.toThrow();
    });
  });
});
