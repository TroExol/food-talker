import type { EAvailableCities } from '@/config/bot/types';

import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { CityValidator } from '@/utils/CityValidator';
import { AppError } from '@/utils/AppError';
import { botConfig } from '@/config/bot';

import type { TCollectionStats } from './types';
import type { YEDataTransformer } from '../yeDataTransformer/YEDataTransformer';
import type { YEApiService } from '../yeApiService/YEApiService';

export class YEDataCollectionService {
  private lastUpdateTime: Date | null = null;
  private errorCount = 0;
  private readonly maxConcurrentRestaurants = 5; // Максимум параллельных запросов к ресторанам
  private readonly maxConcurrentCities = 2; // Максимум параллельных городов

  constructor(
    private readonly yeApiService: YEApiService,
    private readonly yeDataTransformer: YEDataTransformer,
  ) { }

  public updateRestaurants = async (): Promise<void> => {
    try {
      // Параллельная обработка городов с ограничением
      const cityBatches = this.chunkArray(botConfig.availableCities, this.maxConcurrentCities);

      for (const cityBatch of cityBatches) {
        await Promise.all(
          cityBatch.map(cityName => this.updateCityRestaurants(cityName)),
        );

        // Пауза между батчами городов
        if (cityBatches.indexOf(cityBatch) !== cityBatches.length - 1) {
          await sleep(1000);
        }
      }

      this.lastUpdateTime = new Date();
      ConsoleLogger.info('Обновление данных ресторанов Яндекс.Еда завершено', {
        cities: botConfig.availableCities,
        timestamp: this.lastUpdateTime,
      });
    } catch (error) {
      this.errorCount++;
      ConsoleLogger.error('Не удалось обновить данные ресторанов Яндекс.Еда', error as Error);
    }
  };

  public updateRestaurantMenu = async (restaurantId: string, city: EAvailableCities): Promise<void> => {
    try {
      const coordinates = CityValidator.getCityCoordinates(city);

      if (!coordinates) {
        throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
      }

      const restaurant = await this.yeApiService.getRestaurantById(restaurantId, city);

      if (!restaurant) {
        throw AppError.dataCollectionError(`Не удалось найти ресторан Яндекс.Еда по id ${restaurantId} в городе ${city}`);
      }

      await this.yeApiService.getRestaurantMenu(restaurantId, city, false);

      ConsoleLogger.debug('Меню Яндекс.Еда обновлено', {
        restaurantId,
        city,
      });
    } catch (error) {
      this.errorCount++;
      ConsoleLogger.error('Не удалось обновить меню Яндекс.Еда', error as Error, { restaurantId, city });
      throw AppError.dataCollectionError(`Не удалось обновить меню для ${restaurantId} Яндекс.Еда`, error);
    }
  };

  public getCollectionStats = async (): Promise<TCollectionStats> => {
    try {
      const cacheStats = await this.yeApiService.getCacheStats();

      return {
        lastUpdateTime: this.lastUpdateTime,
        totalRestaurants: cacheStats.restaurants,
        totalMenuItems: cacheStats.menus,
        errors: this.errorCount,
      };
    } catch (error) {
      ConsoleLogger.error('Не удалось получить статистику сбора данных Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось получить статистику сбора данных Яндекс.Еда', error);
    }
  };

  public updateCityRestaurants = async (city: EAvailableCities): Promise<void> => {
    try {
      const coordinates = CityValidator.getCityCoordinates(city);

      if (!coordinates) {
        throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
      }

      ConsoleLogger.debug('Обновление данных ресторанов Яндекс.Еда для города', { coordinates });

      const restaurants = await this.yeApiService.getRestaurants(city, false);

      ConsoleLogger.info('Данные ресторанов Яндекс.Еда для города обновлены', {
        coordinates,
        restaurantsCount: restaurants.length,
      });

      // Параллельная обработка ресторанов с ограничением
      const restaurantBatches = this.chunkArray(restaurants, this.maxConcurrentRestaurants);

      for (const restaurantBatch of restaurantBatches) {
        await Promise.all(
          restaurantBatch.map(restaurant =>
            this.updateRestaurantMenu(restaurant.id, city).catch(error => {
              ConsoleLogger.error('Ошибка обновления меню ресторана', error as Error, {
                restaurantId: restaurant.id,
                city,
              });
            }),
          ),
        );

        // Небольшая пауза между батчами ресторанов
        if (restaurantBatches.indexOf(restaurantBatch) !== restaurantBatches.length - 1) {
          await sleep(500);
        }
      }

      ConsoleLogger.info('Меню для всех ресторанов Яндекс.Еда для города обновлено', {
        coordinates,
        restaurantsCount: restaurants.length,
      });
    } catch (error) {
      ConsoleLogger.error('Не удалось обновить данные ресторанов Яндекс.Еда для города', error as Error, { city });
      throw error;
    }
  };

  // Вспомогательный метод для разбиения массива на батчи
  private chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  };
}
