import type {
  TYEApiConfig,
  TYECoordinates,
  TYEMenuItem,
  TYEMenuResponse,
  TYERateLimitState,
  TYERestaurantResponsed,
  TYERestaurantsResponse,
} from '@/models/yandexEda';
import type { TStructuredQuery } from '@/models/search';
import type { TCoordinates } from '@/models/restaurant';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';
import { botConfig } from '@/config/bot';

interface TYEService {
  getRestaurants: (coordinates: TCoordinates) => Promise<TYERestaurantResponsed[]>;
  getRestaurantMenu: (placeSlug: string, coordinates: TCoordinates, brandSlug?: string) => Promise<TYEMenuItem[]>;
  searchRestaurants: (query: TStructuredQuery, coordinates: TCoordinates) => Promise<TYERestaurantResponsed[]>;
  checkRateLimit: () => boolean;
}

export class YEService implements TYEService {
  private readonly config: TYEApiConfig;
  private rateLimitState: TYERateLimitState;

  constructor(config?: Partial<TYEApiConfig>) {
    this.config = {
      baseUrl: 'https://eda.yandex.ru',
      headers: {
        'Content-Type': 'application/json',
        ...botConfig.yandexEda.headers,
      },
      rateLimits: {
        requestsPerMinute: botConfig.yandexEda.rateLimits.requestsPerMinute,
        requestsPerHour: botConfig.yandexEda.rateLimits.requestsPerHour,
        windowSizeMs: 60 * 1000, // 1 минута
      },
      timeout: 10000, // 10 секунд
      retries: 3,
      ...config,
    };

    this.rateLimitState = {
      requests: [],
      lastReset: Date.now(),
    };
  }

  public getRestaurants = async (coordinates: TCoordinates): Promise<TYERestaurantResponsed[]> => {
    this.enforceRateLimit();

    try {
      const yeCoordinates: TYECoordinates = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };

      const headers = {
        ...this.config.headers,
        'x-retpath-y': 'https://eda.yandex.ru/perm?shippingType=delivery',
        'x-ya-client-time': new Date().toISOString(),
        'x-ya-coordinates': `latitude=${coordinates.latitude},longitude=${coordinates.longitude}`,
      };

      const response = await this.makeRequest<TYERestaurantsResponse>(
        '/eats/v1/layout-constructor/v1/layout',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ location: yeCoordinates }),
        },
      );

      const places = response.data?.places_v2_lists?.[0]?.payload?.places || [];

      logger.info('Получены места из Яндекс.Еда', {
        count: places.length,
        coordinates,
      });

      return places;
    } catch (error) {
      logger.error('Ошибка получения мест из Яндекс.Еда', error as Error, { coordinates });
      throw AppError.apiError('YANDEX_EDA_PLACES_FAILED', 'Не удалось получить список ресторанов Яндекс.Еда');
    }
  };

  public getRestaurantMenu = async (
    placeSlug: string,
    coordinates: TCoordinates,
    brandSlug?: string,
  ): Promise<TYEMenuItem[]> => {
    this.enforceRateLimit();

    try {
      const headers = {
        ...this.config.headers,
        'x-retpath-y': brandSlug
          ? `https://eda.yandex.ru/r/${brandSlug}?placeSlug=${placeSlug}`
          : `https://eda.yandex.ru/r/${placeSlug}`,
        'x-ya-client-time': new Date().toISOString(),
        'x-ya-coordinates': `latitude=${coordinates.latitude},longitude=${coordinates.longitude}`,
      };

      const url = `/api/v2/menu/retrieve/${placeSlug}?longitude=${coordinates.longitude}&latitude=${coordinates.latitude}&autoTranslate=false`;

      const response = await this.makeRequest<TYEMenuResponse>(url, {
        method: 'GET',
        headers,
      });

      logger.info('Получено меню ресторана из Яндекс.Еда', {
        placeSlug,
        categoriesCount: response.payload?.categories?.length || 0,
      });

      return response.payload.categories.flatMap(category => category.items);
    } catch (error) {
      logger.error('Ошибка получения меню из Яндекс.Еда', error as Error, { placeSlug });
      throw AppError.apiError('YANDEX_EDA_MENU_FAILED', 'Не удалось получить меню ресторана Яндекс.Еда');
    }
  };

  public searchRestaurants = async (
    query: TStructuredQuery,
    coordinates: TCoordinates,
  ): Promise<TYERestaurantResponsed[]> => {
    // Для поиска используем общий метод получения мест
    // В будущем можно добавить специфичные фильтры на основе query
    const places = await this.getRestaurants(coordinates);

    // Простая фильтрация по названиям ресторанов если указаны
    if (query.restaurants && query.restaurants.length > 0) {
      const filteredPlaces = places.filter(place =>
        query.restaurants!.some(restaurant =>
          place.name.value.toLowerCase().includes(restaurant.toLowerCase())
          || place.brand.name.toLowerCase().includes(restaurant.toLowerCase()),
        ),
      );

      logger.info('Отфильтрованы места по запросу', {
        originalCount: places.length,
        filteredCount: filteredPlaces.length,
        restaurants: query.restaurants,
      });

      return filteredPlaces;
    }

    return places;
  };

  public checkRateLimit = (): boolean => {
    const now = Date.now();
    const windowStart = now - this.config.rateLimits.windowSizeMs;

    // Очищаем старые запросы
    this.rateLimitState.requests = this.rateLimitState.requests.filter(
      timestamp => timestamp > windowStart,
    );

    return this.rateLimitState.requests.length < this.config.rateLimits.requestsPerMinute;
  };

  private enforceRateLimit = (): void => {
    const canMakeRequest = this.checkRateLimit();

    if (!canMakeRequest) {
      const waitTime = this.config.rateLimits.windowSizeMs;
      logger.warn('Rate limit достигнут для Яндекс.Еда API', { waitTime });
      throw AppError.rateLimitError('YANDEX_EDA_RATE_LIMIT', 'Превышен лимит запросов к Яндекс.Еда API');
    }

    // Записываем текущий запрос
    this.rateLimitState.requests.push(Date.now());
  };

  private makeRequest = async <T>(endpoint: string, options: RequestInit): Promise<T> => {
    const url = `${this.config.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as T;

        logger.debug('Яндекс.Еда API запрос выполнен', {
          endpoint,
          attempt,
          status: response.status,
        });

        return data;
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.config.retries) {
          break;
        }

        // Экспоненциальная задержка между попытками
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`Яндекс.Еда API запрос неудачен, повтор через ${delay}ms`, {
          endpoint,
          attempt,
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logger.error('Яндекс.Еда API запрос окончательно неудачен', lastError!, { endpoint });
    throw AppError.networkError('YANDEX_EDA_REQUEST_FAILED', `Не удалось выполнить запрос: ${lastError?.message}`);
  };
}
