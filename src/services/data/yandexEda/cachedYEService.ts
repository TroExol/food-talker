import type { TYERestaurant } from '@/models/yandexEda';
import type { TStructuredQuery } from '@/models/search';
import type { TCoordinates } from '@/models/restaurant';
import type { TMenuItem } from '@/models/menuItem';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';
import { cityValidator } from '@/utils/cityValidator';
import { type EAvailableCities } from '@/config/bot';

import type { CacheService } from '../cache/cacheService';

import { type YEService, yeService as yeServiceInstance } from './yeService';
import { type YEDataTransformer, yeDataTransformer as yeDataTransformerInstance } from './yeDataTransformer';
import { redisCacheService as redisCacheServiceInstance } from '../cache/cacheService';

interface TCachedYEService {
  getRestaurants: (city: EAvailableCities) => Promise<TYERestaurant[]>;
  getRestaurantMenu: (
    placeSlug: string,
    city: EAvailableCities,
    brandSlug?: string,
  ) => Promise<TMenuItem[]>;
  searchItems: (query: TStructuredQuery, city: EAvailableCities) => Promise<TMenuItem[]>;
  invalidateCache: (pattern?: string) => Promise<void>;
  getCacheStats: () => Promise<{ restaurants: number; menus: number; searches: number }>;
}

export class CachedYEService implements TCachedYEService {
  private readonly yeService: YEService;
  private readonly cacheService: CacheService;
  private readonly yeDataTransformer: YEDataTransformer;

  // TTL для разных типов данных (в секундах)
  private readonly cacheTTL = {
    restaurants: 3600, // 1 час
    menu: 1800, // 30 минут
    search: 900, // 15 минут
  };

  constructor(yeService: YEService, cacheService: CacheService, yeDataTransformer: YEDataTransformer) {
    this.yeService = yeService;
    this.cacheService = cacheService;
    this.yeDataTransformer = yeDataTransformer;
  }

  public getRestaurants = async (city: EAvailableCities): Promise<TYERestaurant[]> => {
    const coordinates = cityValidator.getCityCoordinates(city);

    if (!coordinates) {
      throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
    }

    const cacheKey = this.buildCacheKey('restaurants', city, coordinates);

    try {
      // Проверяем кэш
      const cached = await this.cacheService.get<TYERestaurant[]>(cacheKey);

      if (cached) {
        logger.debug('Кэш ресторанов Яндекс.Еда найден', { city, cacheKey });
        return cached;
      }

      // Загружаем из API
      logger.debug('Кэш ресторанов Яндекс.Еда не найден, загружаем из API', { city, coordinates });
      const yePlaces = await this.yeService.getRestaurants(coordinates);

      // Трансформируем данные
      const restaurants = this.yeDataTransformer.transformRestaurants(yePlaces, coordinates);

      // Кэшируем результат
      await this.cacheService.set(cacheKey, restaurants, this.cacheTTL.restaurants);

      logger.info('Рестораны Яндекс.Еда загружены и кэшированы', {
        city,
        count: restaurants.length,
        cacheKey,
      });

      return restaurants;
    } catch (error) {
      logger.error('Не удалось загрузить рестораны Яндекс.Еда', error as Error, { city, coordinates });
      throw AppError.apiError(`Не удалось загрузить рестораны Яндекс.Еда для ${city}`, error);
    }
  };

  public getRestaurantMenu = async (
    placeSlug: string,
    city: EAvailableCities,
    brandSlug?: string,
  ): Promise<TMenuItem[]> => {
    const coordinates = cityValidator.getCityCoordinates(city);
    if (!coordinates) {
      throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
    }

    const cacheKey = this.buildCacheKey('menu', city, coordinates, placeSlug);

    try {
      // Проверяем кэш
      const cached = await this.cacheService.get<TMenuItem[]>(cacheKey);
      if (cached) {
        logger.debug('Кэш меню Яндекс.Еда найден', { placeSlug, city, cacheKey });
        return cached;
      }

      // Загружаем из API
      logger.debug('Кэш меню Яндекс.Еда не найден, загружаем из API', { placeSlug, city });
      const yeMenuItems = await this.yeService.getRestaurantMenu(placeSlug, coordinates, brandSlug);

      // Нужно получить данные ресторана для трансформации
      const restaurant = await this.getRestaurantBySlug(placeSlug, city);
      if (!restaurant) {
        throw AppError.apiError(`Ресторан Яндекс.Еда не найден для slug: ${placeSlug}`);
      }

      // Трансформируем данные
      const menuItems = this.yeDataTransformer.transformMenuItems(yeMenuItems, restaurant);

      // Кэшируем результат
      await this.cacheService.set(cacheKey, menuItems, this.cacheTTL.menu);

      logger.info('Меню Яндекс.Еда загружено и кэшировано', {
        placeSlug,
        city,
        count: menuItems.length,
        cacheKey,
      });

      return menuItems;
    } catch (error) {
      logger.error('Не удалось загрузить меню Яндекс.Еда', error as Error, { placeSlug, city });
      throw AppError.apiError(`Не удалось загрузить меню Яндекс.Еда для ${placeSlug}`, error);
    }
  };

  public searchItems = async (
    query: TStructuredQuery,
    city: EAvailableCities,
  ): Promise<TMenuItem[]> => {
    const coordinates = cityValidator.getCityCoordinates(city);
    if (!coordinates) {
      throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
    }

    const cacheKey = this.buildSearchCacheKey(query, city, coordinates);

    try {
      // Проверяем кэш
      const cached = await this.cacheService.get<TMenuItem[]>(cacheKey);
      if (cached) {
        logger.debug('Кэш поиска Яндекс.Еда найден', { query, city, cacheKey });
        return cached;
      }

      // Загружаем места из API (с кэшированием)
      const restaurants = await this.getRestaurants(city);
      const allMenuItems: TMenuItem[] = [];

      // Загружаем меню для каждого ресторана
      for (const restaurant of restaurants) {
        try {
          const menuItems = await this.getRestaurantMenu(restaurant.id, city);
          allMenuItems.push(...menuItems);
        } catch (error) {
          // Логируем ошибку но продолжаем с другими ресторанами
          logger.warn('Не удалось загрузить меню для ресторана Яндекс.Еда', {
            restaurantId: restaurant.id,
            error: (error as Error).message,
          });
        }
      }

      // Фильтруем по запросу
      const filteredItems = this.filterMenuItems(allMenuItems, query)
        .filter(item => item.available);

      // Кэшируем результат
      await this.cacheService.set(cacheKey, filteredItems, this.cacheTTL.search);

      logger.info('Поиск Яндекс.Еда завершен и кэширован', {
        query,
        city,
        totalItems: allMenuItems.length,
        filteredItems: filteredItems.length,
        cacheKey,
      });

      return filteredItems;
    } catch (error) {
      logger.error('Не удалось выполнить поиск Яндекс.Еда', error as Error, { query, city });
      throw AppError.apiError(`Не удалось выполнить поиск Яндекс.Еда для ${city}`, error);
    }
  };

  public invalidateCache = async (pattern?: string): Promise<void> => {
    try {
      if (pattern) {
        // Простая реализация - очищаем весь кэш если указан паттерн
        // В продакшене можно реализовать более умную логику
        await this.cacheService.clear();
        logger.info('Кэш Яндекс.Еда очищен по паттерну', { pattern });
      } else {
        await this.cacheService.clear();
        logger.info('Все кэш Яндекс.Еда очищен');
      }
    } catch (error) {
      logger.error('Не удалось очистить кэш Яндекс.Еда', error as Error, { pattern });
      throw AppError.cacheError('Не удалось очистить кэш Яндекс.Еда', error);
    }
  };

  public getCacheStats = async (): Promise<{ restaurants: number; menus: number; searches: number }> => {
    try {
      // Приблизительная статистика по типам кэша
      // В реальности нужно было бы отслеживать это более точно
      const stats = await this.cacheService.getStats();

      return {
        restaurants: Math.floor(stats.totalKeys * 0.1), // ~10% ключей - рестораны
        menus: Math.floor(stats.totalKeys * 0.7), // ~70% ключей - меню
        searches: Math.floor(stats.totalKeys * 0.2), // ~20% ключей - поиски
      };
    } catch (error) {
      logger.error('Не удалось получить статистику кэша Яндекс.Еда', error as Error);
      throw AppError.cacheError('Не удалось получить статистику кэша Яндекс.Еда', error);
    }
  };

  private buildCacheKey = (
    type: string,
    city: EAvailableCities,
    coordinates: TCoordinates,
    ...extra: string[]
  ): string => {
    const coordsStr = `${coordinates.latitude.toFixed(4)},${coordinates.longitude.toFixed(4)}`;
    const parts = [type, city, coordsStr, ...extra];
    return parts.join(':');
  };

  private buildSearchCacheKey = (
    query: TStructuredQuery,
    city: EAvailableCities,
    coordinates: TCoordinates,
  ): string => {
    // Создаем стабильный ключ из параметров запроса
    const queryParts = [
      query.restaurants?.sort().join(',') || '',
      query.ingredients?.sort().join(',') || '',
      query.priceRange ? `${query.priceRange.min}-${query.priceRange.max}` : '',
      query.exclusions?.restaurants?.sort().join(',') || '',
      query.exclusions?.ingredients?.sort().join(',') || '',
    ];

    return this.buildCacheKey('search', city, coordinates, queryParts.join('|'));
  };

  public getRestaurantBySlug = async (
    placeSlug: string,
    city: EAvailableCities,
  ): Promise<TYERestaurant | null> => {
    try {
      const restaurants = await this.getRestaurants(city);
      return restaurants.find(r => r.id === placeSlug) || null;
    } catch (error) {
      logger.error('Не удалось получить ресторан Яндекс.Еда по slug', error as Error, { placeSlug });
      return null;
    }
  };

  public filterMenuItems = (items: TMenuItem[], query: TStructuredQuery): TMenuItem[] => {
    return items.filter(item => {
      // Фильтрация по ресторанам
      if (query.restaurants?.length) {
        const restaurantMatch = query.restaurants.some(restaurant =>
          item.restaurant.name.toLowerCase().includes(restaurant.toLowerCase()),
        );
        if (!restaurantMatch) return false;
      }

      // Фильтрация по ингредиентам
      if (query.ingredients?.length) {
        const ingredientMatch = query.ingredients.some(ingredient =>
          item.ingredients.some(itemIngredient =>
            itemIngredient.toLowerCase().includes(ingredient.toLowerCase()),
          ) || item.name.toLowerCase().includes(ingredient.toLowerCase()),
        );
        if (!ingredientMatch) return false;
      }

      // Фильтрация по цене
      if (query.priceRange) {
        if (item.price < query.priceRange.min || item.price > query.priceRange.max) {
          return false;
        }
      }

      // Исключения по ресторанам
      if (query.exclusions?.restaurants?.length) {
        const shouldExclude = query.exclusions.restaurants.some(restaurant =>
          item.restaurant.name.toLowerCase().includes(restaurant.toLowerCase()),
        );
        if (shouldExclude) return false;
      }

      // Исключения по ингредиентам
      if (query.exclusions?.ingredients?.length) {
        const shouldExclude = query.exclusions.ingredients.some(ingredient =>
          item.ingredients.some(itemIngredient =>
            itemIngredient.toLowerCase().includes(ingredient.toLowerCase()),
          ) || item.name.toLowerCase().includes(ingredient.toLowerCase()),
        );
        if (shouldExclude) return false;
      }

      return true;
    });
  };
}

export const cachedYeService = new CachedYEService(
  yeServiceInstance,
  redisCacheServiceInstance,
  yeDataTransformerInstance,
);
