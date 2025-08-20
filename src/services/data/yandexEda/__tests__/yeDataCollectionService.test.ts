import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TRestaurant } from '@/models/restaurant';
import type { TMenuItem } from '@/models/menuItem';

import { EAvailableCities } from '@/config/bot';

import type { CachedYEService } from '../cachedYEService';

import { YEDataCollectionService } from '../yeDataCollectionService';

// Мокаем node-cron
vi.mock('node-cron', () => ({
  schedule: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Мокаем cityValidator
vi.mock('@/utils/cityValidator', () => ({
  cityValidator: {
    getCityCoordinates: vi.fn().mockReturnValue({ latitude: 58.01, longitude: 56.23 }),
  },
}));

describe('YEDataCollectionService', () => {
  let dataCollectionService: YEDataCollectionService;
  let mockCachedYEService: CachedYEService;

  const mockRestaurants: TRestaurant[] = [
    {
      id: 'restaurant-1',
      name: 'Тест Ресторан 1',
      coordinates: { latitude: 58.01, longitude: 56.23 },
      workingHours: { open: '09:00', close: '23:00', isOpen: true },
      isActive: true,
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
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockCachedYEService = {
      getRestaurants: vi.fn().mockResolvedValue(mockRestaurants),
      getRestaurantMenu: vi.fn().mockResolvedValue(mockMenuItems),
      getRestaurantBySlug: vi.fn().mockResolvedValue(mockRestaurants[0]),
      searchItems: vi.fn().mockResolvedValue(mockMenuItems),
      invalidateCache: vi.fn(),
      getCacheStats: vi.fn().mockResolvedValue({
        restaurants: 5,
        menus: 25,
        searches: 3,
      }),
    } as unknown as CachedYEService;

    dataCollectionService = new YEDataCollectionService(mockCachedYEService);
  });

  describe('startCollection', () => {
    it('должен запустить сбор данных и выполнить первоначальную загрузку', async () => {
      void dataCollectionService.startCollection();
      await vi.advanceTimersToNextTimerAsync();

      // Проверяем что вызваны методы для загрузки данных
      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledTimes(2); // Для двух городов
    });

    it('должен предотвратить повторный запуск', async () => {
      void dataCollectionService.startCollection();
      await vi.advanceTimersToNextTimerAsync();

      // Попытка повторного запуска
      await dataCollectionService.startCollection();

      // Должен быть вызван только один раз (первый запуск)
      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledTimes(2);
    });

    it('должен обработать ошибку при запуске', async () => {
      mockCachedYEService.getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

      await expect(dataCollectionService.startCollection()).rejects.toThrow('Не удалось запустить сбор данных');
    });
  });

  describe('updateRestaurantData', () => {
    it('должен обновить данные для конкретного города', async () => {
      await dataCollectionService.updateRestaurantData(EAvailableCities.PERM);

      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledTimes(1);
      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledWith(
        EAvailableCities.PERM,
      );
    });

    it('должен обновить данные для всех городов если город не указан', async () => {
      await dataCollectionService.updateRestaurantData();

      expect(mockCachedYEService.getRestaurants).toHaveBeenCalledTimes(2); // Для двух городов
    });

    it('должен обработать ошибку API', async () => {
      mockCachedYEService.getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

      await expect(dataCollectionService.updateRestaurantData(EAvailableCities.PERM))
        .rejects.toThrow('Не удалось обновить данные ресторанов Яндекс.Еда для Пермь');
    });
  });

  describe('updateMenuData', () => {
    it('должен обновить меню ресторана', async () => {
      await dataCollectionService.updateMenuData('restaurant-1', EAvailableCities.PERM);

      expect(mockCachedYEService.getRestaurantMenu).toHaveBeenCalledWith(
        'restaurant-1',
        EAvailableCities.PERM,
        'brand-restaurant-1',
      );
    });

    it('должен обработать ошибку загрузки меню', async () => {
      mockCachedYEService.getRestaurantMenu = vi.fn().mockRejectedValue(new Error('Menu API Error'));

      await expect(dataCollectionService.updateMenuData('restaurant-1', 'Пермь' as EAvailableCities))
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
        updateFrequency: 'каждые 40 минут',
        isRunning: false,
        errors: 0,
      });
    });

    it('должен учитывать ошибки в статистике', async () => {
      // Вызываем ошибку
      mockCachedYEService.getRestaurants = vi.fn().mockRejectedValue(new Error('API Error'));

      try {
        await dataCollectionService.updateRestaurantData();
      } catch {
        // Игнорируем ошибку
      }

      const stats = await dataCollectionService.getCollectionStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('stopCollection', () => {
    it('должен остановить сбор данных и cron задачи', async () => {
      void dataCollectionService.startCollection();
      await vi.advanceTimersToNextTimerAsync();
      dataCollectionService.stopCollection();

      const stats = await dataCollectionService.getCollectionStats();
      expect(stats.isRunning).toBe(false);
    });
  });
});
