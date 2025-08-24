import * as cron from 'node-cron';

import type { CityValidator } from '@/utils/cityValidator';
import type { EAvailableCities } from '@/config/bot/types';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';
import { botConfig } from '@/config/bot';

import type { TCollectionStats, TYEDataCollectionService } from './types';
import type { YEApiService } from '../yeApiService/YEApiService';

export class YEDataCollectionService implements TYEDataCollectionService {
  private cronJobs: cron.ScheduledTask[] = [];
  private isRunning = false;
  private lastUpdateTime: Date | null = null;
  private errorCount = 0;
  private readonly frequencyMinutes = {
    updateRestaurants: 40,
    clearCache: 30,
  };

  constructor(
    private readonly yeApiService: YEApiService,
    private readonly cityValidator: CityValidator,
  ) { }

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
      const restaurantsUpdateJob = cron.schedule(`*/${this.frequencyMinutes.updateRestaurants} * * * *`, async () => {
        logger.info('Начало запланированного обновления данных ресторанов Яндекс.Еда');
        await this.updateRestaurants();
      });

      // Очистка просроченного кэша каждые 30 минут
      const cacheClearJob = cron.schedule(`*/${this.frequencyMinutes.clearCache} * * * *`, async () => {
        logger.debug('Начало очистки просроченного кэша Яндекс.Еда');
        await this.cleanupExpiredCache();
      });

      this.cronJobs.push(restaurantsUpdateJob, cacheClearJob);

      // Запускаем задачи
      void restaurantsUpdateJob.start();
      void cacheClearJob.start();

      logger.info('Настроены задачи сбора данных Яндекс.Еда', {
        updateRestaurants: `каждые ${this.frequencyMinutes.updateRestaurants} минут`,
        clearCache: `каждые ${this.frequencyMinutes.clearCache} минут`,
      });
    } catch (error) {
      logger.error('Не удалось настроить задачи сбора данных Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось настроить задачи сбора данных Яндекс.Еда', error);
    }
  };

  public updateRestaurants = async (): Promise<void> => {
    try {
      for (const cityName of botConfig.availableCities) {
        await this.updateCityRestaurants(cityName);
      }

      this.lastUpdateTime = new Date();
      logger.info('Обновление данных ресторанов Яндекс.Еда завершено', {
        cities: botConfig.availableCities,
        timestamp: this.lastUpdateTime,
      });
    } catch (error) {
      this.errorCount++;
      logger.error('Не удалось обновить данные ресторанов Яндекс.Еда', error as Error);
    }
  };

  public updateRestaurantMenu = async (restaurantId: string, city: EAvailableCities): Promise<void> => {
    try {
      const restaurant = await this.yeApiService.getRestaurantById(restaurantId, city);

      if (!restaurant) {
        throw AppError.dataCollectionError(`Не удалось найти ресторан Яндекс.Еда по id ${restaurantId} в городе ${city}`);
      }

      await this.yeApiService.getRestaurantMenu(restaurantId, city, restaurant.additionalInfo.brandSlug);

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

  public getCollectionStats = async (): Promise<TCollectionStats> => {
    try {
      // Используем статистику из CachedYEService
      const cacheStats = await this.yeApiService.getCacheStats();

      return {
        lastUpdateTime: this.lastUpdateTime,
        totalRestaurants: cacheStats.restaurants,
        totalMenuItems: cacheStats.menus,
        updateFrequency: `каждые ${this.frequencyMinutes.updateRestaurants} минут`,
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

  public updateCityRestaurants = async (city: EAvailableCities): Promise<void> => {
    try {
      const coordinates = this.cityValidator.getCityCoordinates(city);

      if (!coordinates) {
        throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
      }

      logger.debug('Обновление данных ресторанов Яндекс.Еда для города', { coordinates });

      const restaurants = await this.yeApiService.getRestaurants(city);

      logger.info('Данные ресторанов Яндекс.Еда для города обновлены', {
        coordinates,
        restaurantsCount: restaurants.length,
      });

      for (const restaurant of restaurants) {
        await this.updateRestaurantMenu(restaurant.id, city);
      }

      logger.info('Меню для всех ресторанов Яндекс.Еда для города обновлено', {
        coordinates,
        restaurantsCount: restaurants.length,
      });
    } catch (error) {
      logger.error('Не удалось обновить данные ресторанов Яндекс.Еда для города', error as Error, { city });
      throw error;
    }
  };

  private cleanupExpiredCache = async (): Promise<void> => {
    try {
      // CacheService автоматически очищает просроченные записи при доступе
      // Здесь можем добавить дополнительную логику если нужно
      const stats = await this.cachedYEService.getCacheStats();
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
