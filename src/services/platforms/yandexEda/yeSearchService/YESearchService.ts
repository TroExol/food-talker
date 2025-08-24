import type { CityValidator } from '@/utils/cityValidator';
import type { TStructuredQuery } from '@/types/search';
import type { TCoordinates } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';
import { type EAvailableCities } from '@/config/bot/types';

import type { YEApiService } from '../yeApiService/YEApiService';
import type { CacheService } from '../../../cacheService/CacheService';

export class YESearchService {
  // TTL в секундах
  private readonly cacheTTL = 900;

  constructor(
    private readonly yeApiService: YEApiService,
    private readonly cacheService: CacheService,
    private readonly cityValidator: CityValidator,
  ) { }

  public searchMenu = async (
    query: TStructuredQuery,
    city: EAvailableCities,
  ): Promise<TMenuItem[]> => {
    const coordinates = this.cityValidator.getCityCoordinates(city);
    if (!coordinates) {
      throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
    }

    const cacheKey = this.buildSearchCacheKey(query, coordinates);

    try {
      // Проверяем кэш
      const cached = await this.cacheService.get<TMenuItem[]>(cacheKey);
      if (cached) {
        logger.debug('Кэш поиска Яндекс.Еда найден', { query, coordinates, cacheKey });
        return cached;
      }

      // Загружаем места из API (с кэшированием)
      const restaurants = await this.yeApiService.getRestaurants(city);
      const allMenuItems: TMenuItem[] = [];

      // Загружаем меню для каждого ресторана
      for (const restaurant of restaurants) {
        try {
          const menuItems = await this.yeApiService.getRestaurantMenu(
            restaurant.id,
            city,
            restaurant.additionalInfo.brandSlug,
          );
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
      await this.cacheService.set(cacheKey, filteredItems, this.cacheTTL);

      logger.info('Поиск Яндекс.Еда завершен и кэширован', {
        query,
        coordinates,
        totalItems: allMenuItems.length,
        filteredItems: filteredItems.length,
        cacheKey,
      });

      return filteredItems;
    } catch (error) {
      logger.error('Не удалось выполнить поиск Яндекс.Еда', error as Error, { query, coordinates });
      throw AppError.apiError(`Не удалось выполнить поиск Яндекс.Еда для ${city}`, error);
    }
  };

  public invalidateCache = async (): Promise<void> => {
    try {
      await this.cacheService.clear();
      logger.info('Весь кэш Яндекс.Еда очищен');
    } catch (error) {
      logger.error('Не удалось очистить кэш Яндекс.Еда', error as Error);
      throw AppError.cacheError('Не удалось очистить кэш Яндекс.Еда', error);
    }
  };

  public getCacheStats = async () => {
    try {
      return this.cacheService.getStats();
    } catch (error) {
      logger.error('Не удалось получить статистику кэша Яндекс.Еда', error as Error);
      throw AppError.cacheError('Не удалось получить статистику кэша Яндекс.Еда', error);
    }
  };

  private buildCacheKey = (
    type: string,
    coordinates: TCoordinates,
    ...extra: string[]
  ): string => {
    const coordsStr = `${coordinates.latitude.toFixed(4)},${coordinates.longitude.toFixed(4)}`;
    const parts = [type, coordsStr, ...extra];
    return parts.join(':');
  };

  private buildSearchCacheKey = (
    query: TStructuredQuery,
    coordinates: TCoordinates,
  ): string => {
    // Создаем стабильный ключ из параметров запроса
    const queryParts = [
      query.restaurants?.sort().join(',') || '',
      query.tags?.sort().join(',') || '',
      query.priceRange ? `${query.priceRange.min}-${query.priceRange.max}` : '',
      query.exclusions?.restaurants?.sort().join(',') || '',
      query.exclusions?.tags?.sort().join(',') || '',
    ];

    return this.buildCacheKey('search', coordinates, queryParts.join('|'));
  };

  private filterMenuItems = (items: TMenuItem[], query: TStructuredQuery): TMenuItem[] => {
    return items.filter(item => {
      // Фильтрация по ресторанам
      if (query.restaurants?.length) {
        const restaurantMatch = query.restaurants.some(restaurant =>
          item.restaurant.name.toLowerCase().includes(restaurant),
        );
        if (!restaurantMatch) return false;
      }

      if (query.tags) {
        // Если в запросе есть теги, то проверяем, что хотя бы один из тегов есть в меню
        if (
          !query.tags.some(tag => item.ingredients.some(i => i.includes(tag)))
          && !query.tags.some(tag => item.description.includes(tag))
          && !query.tags.some(tag => item.name.includes(tag))
        ) {
          return false;
        }
      }

      // Фильтрация по цене
      if (query.priceRange) {
        if (item.price < query.priceRange.min || item.price > query.priceRange.max) {
          return false;
        }
      }

      // Исключения
      if (query.exclusions) {
        if (query.exclusions.restaurants?.includes(item.restaurant.name)) {
          return false;
        }
        if (
          query.exclusions.tags?.some(tag => item.ingredients.some(i => i.includes(tag)))
          || query.exclusions.tags
            ?.some(tag => item.description.toLowerCase().includes(tag))
          || query.exclusions.tags
            ?.some(tag => item.restaurant.name.toLowerCase().includes(tag))
        ) {
          return false;
        }
        if (query.exclusions.priceRange) {
          if (item.price >= query.exclusions.priceRange.min && item.price <= query.exclusions.priceRange.max) {
            return false;
          }
        }
      }

      return true;
    });
  };
}
