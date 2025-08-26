import type { EAvailableCities } from '@/config/bot/types';

import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { CityValidator } from '@/utils/CityValidator';
import { AppError } from '@/utils/AppError';
import { botConfig } from '@/config/bot';

import type { TCollectionStats } from './types';
import type { YEApiService } from '../yeApiService/YEApiService';

export class YEDataCollectionService {
  private lastUpdateTime: Date | null = null;
  private errorCount = 0;

  constructor(
    private readonly yeApiService: YEApiService,
  ) { }

  public updateRestaurants = async (): Promise<void> => {
    try {
      for (const cityName of botConfig.availableCities) {
        await this.updateCityRestaurants(cityName);
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
      const restaurant = await this.yeApiService.getRestaurantById(restaurantId, city);

      if (!restaurant) {
        throw AppError.dataCollectionError(`Не удалось найти ресторан Яндекс.Еда по id ${restaurantId} в городе ${city}`);
      }

      await this.yeApiService.getRestaurantMenu(restaurantId, city);

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

  public initialDataLoad = async (): Promise<void> => {
    try {
      ConsoleLogger.info('Начало первоначальной загрузки данных Яндекс.Еда');

      for (const city of botConfig.availableCities) {
        await this.updateCityRestaurants(city);

        // Небольшая пауза между городами чтобы не перегружать API
        if (botConfig.availableCities.indexOf(city) !== botConfig.availableCities.length - 1) {
          await sleep(2000);
        }
      }

      ConsoleLogger.info('Первоначальная загрузка данных Яндекс.Еда завершена');
    } catch (error) {
      ConsoleLogger.error('Не удалось загрузить первоначальные данные Яндекс.Еда', error as Error);
      throw AppError.dataCollectionError('Не удалось загрузить первоначальные данные Яндекс.Еда', error);
    }
  };

  public updateCityRestaurants = async (city: EAvailableCities): Promise<void> => {
    try {
      const coordinates = CityValidator.getCityCoordinates(city);

      if (!coordinates) {
        throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
      }

      ConsoleLogger.debug('Обновление данных ресторанов Яндекс.Еда для города', { coordinates });

      const restaurants = await this.yeApiService.getRestaurants(city);

      ConsoleLogger.info('Данные ресторанов Яндекс.Еда для города обновлены', {
        coordinates,
        restaurantsCount: restaurants.length,
      });

      for (const restaurant of restaurants) {
        await this.updateRestaurantMenu(restaurant.id, city);
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
}
