import * as cron from 'node-cron';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';
import { cityValidator } from '@/utils/cityValidator';
import { botConfig, type EAvailableCities } from '@/config/bot';

import type { CachedYEService } from './cachedYEService';

interface TYEDataCollectionService {
  startCollection(): Promise<void>;
  stopCollection(): void;
  updateRestaurantData(city?: EAvailableCities): Promise<void>;
  updateMenuData(restaurantId: string, city: EAvailableCities): Promise<void>;
  scheduleUpdates(): void;
  getCollectionStats(): TCollectionStats;
}

export interface TCollectionStats {
  lastUpdateTime: Date | null;
  totalRestaurants: number;
  totalMenuItems: number;
  updateFrequency: string;
  isRunning: boolean;
  errors: number;
}

export class YEDataCollectionService implements TYEDataCollectionService {
  private readonly cachedYEService: CachedYEService;
  private cronJobs: cron.ScheduledTask[] = [];
  private isRunning = false;
  private lastUpdateTime: Date | null = null;
  private errorCount = 0;
  private readonly frequencyMin = {
    restaurant: 40,
    cache: 30,
  };

  constructor(cachedYEService: CachedYEService) {
    this.cachedYEService = cachedYEService;
  }

  public startCollection = async (): Promise<void> => {
    try {
      if (this.isRunning) {
        logger.warn('Сбор данных Яндекс.Еда уже запущен');
        return;
      }

      this.isRunning = true;
      this.scheduleUpdates();

      // Выполняем первоначальную загрузку данных
      await this.initialDataLoad();

      logger.info('Сбор данных Яндекс.Еда запущен');
    } catch (error) {
      this.isRunning = false;
      logger.error('Не удалось запустить сбор данных Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось запустить сбор данных Яндекс.Еда', error);
    }
  };

  public stopCollection = (): void => {
    try {
      this.isRunning = false;

      // Останавливаем все cron задачи
      this.cronJobs.forEach(job => {
        void (async () => {
          try {
            await job.stop();
          } catch (error) {
            logger.error('Не удалось остановить cron задачу Яндекс.Еда', error as Error);
          }
        })();
      });
      this.cronJobs = [];

      logger.info('Сбор данных Яндекс.Еда остановлен');
    } catch (error) {
      logger.error('Не удалось остановить сбор данных Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось остановить сбор данных Яндекс.Еда', error);
    }
  };

  public scheduleUpdates = (): void => {
    try {
      // Обновление данных ресторанов каждые 40 минут
      const restaurantUpdateJob = cron.schedule(`*/${this.frequencyMin.restaurant} * * * *`, async () => {
        logger.info('Начало запланированного обновления данных ресторанов Яндекс.Еда');
        await this.updateAllRestaurantData();
      });

      // Очистка просроченного кэша каждые 30 минут
      const cacheCleanupJob = cron.schedule(`*/${this.frequencyMin.cache} * * * *`, () => {
        logger.debug('Начало очистки просроченного кэша Яндекс.Еда');
        this.cleanupExpiredCache();
      });

      this.cronJobs.push(restaurantUpdateJob, cacheCleanupJob);

      // Запускаем задачи
      void restaurantUpdateJob.start();
      void cacheCleanupJob.start();

      logger.info('Настроены задачи сбора данных Яндекс.Еда', {
        restaurantUpdates: `каждые ${this.frequencyMin.restaurant} минут`,
        cacheCleanup: `каждые ${this.frequencyMin.cache} минут`,
      });
    } catch (error) {
      logger.error('Не удалось настроить задачи сбора данных Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось настроить задачи сбора данных Яндекс.Еда', error);
    }
  };

  public updateRestaurantData = async (city?: EAvailableCities): Promise<void> => {
    try {
      const citiesToUpdate = city ? [city] : botConfig.availableCities;

      for (const cityName of citiesToUpdate) {
        await this.updateCityRestaurants(cityName);
      }

      this.lastUpdateTime = new Date();
      logger.info('Обновление данных ресторанов Яндекс.Еда завершено', {
        cities: citiesToUpdate,
        timestamp: this.lastUpdateTime,
      });
    } catch (error) {
      this.errorCount++;
      logger.error('Не удалось обновить данные ресторанов Яндекс.Еда', error as Error, { city });
      throw AppError.dataCollectionError(`Не удалось обновить данные ресторанов Яндекс.Еда для ${city}`, error);
    }
  };

  public updateMenuData = async (restaurantId: string, city: EAvailableCities): Promise<void> => {
    try {
      const restaurant = await this.cachedYEService.getRestaurantBySlug(restaurantId, city);

      // CachedYEService уже проверит кэш и загрузит данные если нужно
      await this.cachedYEService.getRestaurantMenu(restaurantId, city, restaurant?.additionalInfo.brandSlug);

      logger.debug('Меню Яндекс.Еда обновлено', {
        restaurantId,
        city,
      });
    } catch (error) {
      this.errorCount++;
      logger.error('Не удалось обновить меню Яндекс.Еда', error as Error, { restaurantId, city });
      throw AppError.dataCollectionError(`Не удалось обновить меню для ${restaurantId} Яндекс.Еда`, error);
    }
  };

  public getCollectionStats = (): TCollectionStats => {
    try {
      // Используем статистику из CachedYEService
      const cacheStats = this.cachedYEService.getCacheStats();

      return {
        lastUpdateTime: this.lastUpdateTime,
        totalRestaurants: cacheStats.restaurants,
        totalMenuItems: cacheStats.menus,
        updateFrequency: `каждые ${this.frequencyMin.restaurant} минут`,
        isRunning: this.isRunning,
        errors: this.errorCount,
      };
    } catch (error) {
      logger.error('Не удалось получить статистику сбора данных Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось получить статистику сбора данных Яндекс.Еда', error);
    }
  };

  private initialDataLoad = async (): Promise<void> => {
    try {
      logger.info('Начало первоначальной загрузки данных Яндекс.Еда');

      // Загружаем данные для всех поддерживаемых городов
      for (const city of botConfig.availableCities) {
        await this.updateCityRestaurants(city);

        // Небольшая пауза между городами чтобы не перегружать API
        if (botConfig.availableCities.indexOf(city) !== botConfig.availableCities.length - 1) {
          await this.delay(2000);
        }
      }

      logger.info('Первоначальная загрузка данных Яндекс.Еда завершена');
    } catch (error) {
      logger.error('Не удалось загрузить первоначальные данные Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось загрузить первоначальные данные Яндекс.Еда', error);
    }
  };

  private updateCityRestaurants = async (city: EAvailableCities): Promise<void> => {
    try {
      const coordinates = cityValidator.getCityCoordinates(city);

      if (!coordinates) {
        throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
      }

      logger.debug('Обновление данных ресторанов Яндекс.Еда для города', { city, coordinates });

      // CachedYEService уже проверит кэш и загрузит данные если нужно
      const restaurants = await this.cachedYEService.getRestaurants(city);

      logger.info('Данные ресторанов Яндекс.Еда для города обновлены', {
        city,
        restaurantsCount: restaurants.length,
      });

      for (const restaurant of restaurants) {
        await this.updateMenuData(restaurant.id, city);
      }

      logger.info('Меню для всех ресторанов Яндекс.Еда для города обновлено', {
        city,
        restaurantsCount: restaurants.length,
      });
    } catch (error) {
      logger.error('Не удалось обновить данные ресторанов Яндекс.Еда для города', error as Error, { city });
      throw error;
    }
  };

  private updateAllRestaurantData = async (): Promise<void> => {
    try {
      await this.updateRestaurantData();
    } catch (error) {
      // Логируем ошибку но не прерываем работу планировщика
      logger.error('Не удалось запланировать обновление данных ресторанов Яндекс.Еда', error as Error);
    }
  };

  private cleanupExpiredCache = (): void => {
    try {
      // CacheService автоматически очищает просроченные записи при доступе
      // Здесь можем добавить дополнительную логику если нужно
      const stats = this.cachedYEService.getCacheStats();
      logger.debug('Проверка очистки кэша Яндекс.Еда', {
        restaurants: stats.restaurants,
        menus: stats.menus,
        searches: stats.searches,
      });
    } catch (error) {
      logger.error('Не удалось очистить кэш Яндекс.Еда', error as Error);
    }
  };

  private delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));
}
