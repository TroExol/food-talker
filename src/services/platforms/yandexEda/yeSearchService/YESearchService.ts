import type { TStructuredQuery } from '@/types/search';
import type { TCoordinates } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { CityValidator } from '@/utils/CityValidator';
import { AppError } from '@/utils/AppError';
import { type EAvailableCities } from '@/config/bot/types';

import type { YEApiService } from '../yeApiService/YEApiService';
import type { CacheService } from '../../../cacheService/CacheService';

export class YESearchService {
  // TTL в секундах
  private readonly cacheTTL = 900;

  constructor(
    private readonly yeApiService: YEApiService,
    private readonly cacheService: CacheService,
  ) { }

  public searchMenu = async (
    query: TStructuredQuery,
    city: EAvailableCities,
  ): Promise<TMenuItem[]> => {
    const coordinates = CityValidator.getCityCoordinates(city);
    if (!coordinates) {
      throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
    }

    const cacheKey = this.buildSearchCacheKey(query, coordinates);

    try {
      const cached = await this.cacheService.get<TMenuItem[]>(cacheKey);
      if (cached) {
        ConsoleLogger.debug('Кэш поиска Яндекс.Еда найден', { query, coordinates, cacheKey });
        return cached;
      }

      const restaurants = await this.yeApiService.getRestaurants(city);
      const allMenuItems: TMenuItem[] = [];

      const addedMenu: Map<string, TMenuItem> = new Map();

      // Параллельно загружаем меню для всех ресторанов
      const menuPromises = restaurants.map(async restaurant => {
        try {
          return await this.yeApiService.getRestaurantMenu(restaurant.id, city);
        } catch (error) {
          // Логируем ошибку но продолжаем с другими ресторанами
          ConsoleLogger.warn('Не удалось загрузить меню для ресторана Яндекс.Еда', {
            restaurantId: restaurant.id,
            error: (error as Error).message,
          });
          return [];
        }
      });

      // Ждем завершения всех загрузок меню
      const menuResults = await Promise.all(menuPromises);

      // Объединяем все результаты
      for (const menuItems of menuResults) {
        for (const item of menuItems) {
          const key = `${item.restaurant.name}-${item.name}-${item.price}`;
          if (!addedMenu.has(key)) {
            addedMenu.set(key, item);
            allMenuItems.push(item);
          }
        }
      }

      const filteredItems = this.filterMenuItems(allMenuItems, query);

      const sortedItems = this.sortByRelevance(filteredItems, query);

      // Кэшируем результат
      await this.cacheService.set(cacheKey, sortedItems, this.cacheTTL);

      ConsoleLogger.info('Поиск Яндекс.Еда завершен и кэширован', {
        query,
        coordinates,
        totalItems: allMenuItems.length,
        sortedItems: sortedItems.length,
        cacheKey,
      });

      return sortedItems;
    } catch (error) {
      ConsoleLogger.error('Не удалось выполнить поиск Яндекс.Еда', error as Error, { query, coordinates });
      throw AppError.apiError(`Не удалось выполнить поиск Яндекс.Еда для ${city}`, error);
    }
  };

  public invalidateCache = async (): Promise<void> => {
    try {
      await this.cacheService.clear();
      ConsoleLogger.info('Весь кэш Яндекс.Еда очищен');
    } catch (error) {
      ConsoleLogger.error('Не удалось очистить кэш Яндекс.Еда', error as Error);
      throw AppError.cacheError('Не удалось очистить кэш Яндекс.Еда', error);
    }
  };

  public getCacheStats = async () => {
    try {
      return this.cacheService.getStats();
    } catch (error) {
      ConsoleLogger.error('Не удалось получить статистику кэша Яндекс.Еда', error as Error);
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
      // Бизнес логика
      if (!item.available) {
        return false;
      }

      // Фильтрация по ресторанам
      if (query.restaurants?.length) {
        const restaurantMatch = query.restaurants.some(restaurant =>
          item.restaurant.name.toLowerCase().includes(restaurant.toLowerCase()),
        );
        if (!restaurantMatch) return false;
      }

      // Фильтрация по категориям блюд
      if (query.category) {
        const categoryMatch = item.category?.toLowerCase() === query.category.toLowerCase();
        if (!categoryMatch) return false;
      }

      // Улучшенная фильтрация по тегам
      if (query.tags?.length) {
        const relevanceScore = this.calculateTagRelevance(item, query.tags);
        if (relevanceScore === 0) return false;
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

        // Исключения по категориям
        if (query.exclusions.category?.toLowerCase() === item.category?.toLowerCase()) {
          return false;
        }

        if (
          query.exclusions.tags?.some(tag => item.ingredients.some(i => i.toLowerCase().includes(tag.toLowerCase())))
          || query.exclusions.tags
            ?.some(tag => item.description.toLowerCase().includes(tag.toLowerCase()))
          || query.exclusions.tags
            ?.some(tag => item.restaurant.name.toLowerCase().includes(tag.toLowerCase()))
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

  // Новая система оценки релевантности тегов
  private calculateTagRelevance = (item: TMenuItem, queryTags: string[]): number => {
    let totalScore = 0;
    const itemText = `${item.name} ${item.description} ${item.ingredients.join(' ')}`.toLowerCase();

    for (const tag of queryTags) {
      const tagLower = tag.toLowerCase();
      let tagScore = 0;

      // Точное совпадение в названии (высший приоритет)
      if (item.name.toLowerCase().includes(tagLower)) {
        tagScore += 10;
      }

      // Точное совпадение в описании
      if (item.description.toLowerCase().includes(tagLower)) {
        tagScore += 5;
      }

      // Совпадение в ингредиентах
      const ingredientMatches = item.ingredients.filter(ingredient =>
        ingredient.toLowerCase().includes(tagLower),
      ).length;
      tagScore += ingredientMatches * 3;

      // Частичное совпадение (слова содержат тег)
      const words = itemText.split(/\s+/);
      const partialMatches = words.filter(word => word.includes(tagLower)).length;
      tagScore += partialMatches * 1;

      // Если тег найден хотя бы одним способом, добавляем к общему счету
      if (tagScore > 0) {
        totalScore += tagScore;
      }
    }

    return totalScore;
  };

  // Новая функция для сортировки по релевантности
  public sortByRelevance = (items: TMenuItem[], query: TStructuredQuery): TMenuItem[] => {
    return items.sort((a, b) => {
      const scoreA = this.calculateItemScore(a, query);
      const scoreB = this.calculateItemScore(b, query);

      // Сначала по релевантности (убывание)
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // При равной релевантности - по цене (возрастание)
      if (a.price !== b.price) {
        return a.price - b.price;
      }

      // По названию для стабильности
      return a.name.localeCompare(b.name);
    });
  };

  // Комплексная оценка релевантности блюда
  private calculateItemScore = (item: TMenuItem, query: TStructuredQuery): number => {
    let score = 0;

    // Базовый счет за наличие изображения
    if (item.image) {
      score += 2;
    }

    // Релевантность по тегам
    if (query.tags?.length) {
      score += this.calculateTagRelevance(item, query.tags);
    }

    // Бонус за соответствие категории (высокий приоритет)
    if (query.category) {
      const categoryMatch = item.category?.toLowerCase() === query.category.toLowerCase();
      if (categoryMatch) {
        score += 20; // Высокий бонус за соответствие категории
      }
    }

    // Бонус за соответствие ценовому диапазону
    if (query.priceRange) {
      const priceRange = query.priceRange.max - query.priceRange.min;
      const pricePosition = (item.price - query.priceRange.min) / priceRange;

      // Бонус за блюда в середине ценового диапазона
      if (pricePosition >= 0.2 && pricePosition <= 0.8) {
        score += 3;
      }
    }

    // Бонус за рестораны из запроса
    if (query.restaurants?.length) {
      const restaurantMatch = query.restaurants.some(restaurant =>
        item.restaurant.name.toLowerCase().includes(restaurant.toLowerCase()),
      );
      if (restaurantMatch) {
        score += 5;
      }
    }

    return score;
  };
}
