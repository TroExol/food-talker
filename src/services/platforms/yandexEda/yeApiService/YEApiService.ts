import fetch, { type RequestInit } from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

import type { TCoordinates } from '@/types/restaurant';
import type { MenuService } from '@/services/menu/MenuService/MenuService';
import type { CacheService } from '@/services/cacheService/CacheService';
import type { ApiRequestLoggingService } from '@/services/ApiRequestLoggingService/ApiRequestLoggingService';
import type { EAvailableCities } from '@/config/bot/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { CityValidator } from '@/utils/CityValidator';
import { AppError } from '@/utils/AppError';
import { type TMenuItem } from '@/types/menuItem';
import { EApiRequestType } from '@/types/apiRequestLogging';
import { environment } from '@/config/environment';
import { botConfig } from '@/config/bot';

import type {
  TYEApiConfig,
  TYECoordinates,
  TYEMenuFromServer,
  TYEMenuItemFromServer,
  TYERateLimitState,
  TYERestaurant,
  TYERestaurantFromServer,
  TYERestaurantsFromServer,
} from './types';
import type { YEDataTransformer } from '../yeDataTransformer/YEDataTransformer';

export class YEApiService {
  private readonly config: TYEApiConfig;
  private readonly rateLimitState: TYERateLimitState;
  // TTL для разных типов данных (в секундах)
  private readonly cacheTTL = {
    restaurants: 3600, // 1 час
  };

  constructor(
    private readonly cacheService: CacheService,
    private readonly yeDataTransformer: YEDataTransformer,
    private readonly menuService: MenuService,
    private readonly apiRequestLoggingService: ApiRequestLoggingService,
  ) {
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
      retries: botConfig.yandexEda.retries ?? 3,
      delayBetweenRequestsMs: botConfig.yandexEda.delayBetweenRequestsMs ?? 100, // Задержка между запросами
      proxyUrl: environment.PROXY_URL,
    };

    this.rateLimitState = {
      requests: [],
      lastReset: Date.now(),
    };
  }

  public requestRestaurants = async (coordinates: TCoordinates): Promise<TYERestaurantFromServer[]> => {
    await this.enforceRateLimit();

    try {
      const yeCoordinates: TYECoordinates = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };

      const headers = {
        ...this.config.headers,
        'x-retpath-y': 'https://eda.yandex.ru/perm?shippingType=delivery',
        'x-ya-client-time': new Date().toISOString(),
        'x-ya-coordinates': `latitude=${yeCoordinates.latitude},longitude=${yeCoordinates.longitude}`,
      };

      const response = await this.makeRequest<TYERestaurantsFromServer>(
        '/eats/v1/layout-constructor/v1/layout',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ location: yeCoordinates }),
        },
      );

      const restaurants = response.data?.places_v2_lists?.[0]?.payload?.places || [];

      ConsoleLogger.info('Получены рестораны из Яндекс.Еда', {
        count: restaurants.length,
        coordinates,
      });

      return restaurants;
    } catch (error) {
      ConsoleLogger.error('Ошибка получения ресторанов из Яндекс.Еда', error as Error, { coordinates });
      throw AppError.apiError('YANDEX_EDA_PLACES_FAILED', 'Не удалось получить список ресторанов Яндекс.Еда');
    }
  };

  public getRestaurants = async (
    city: EAvailableCities,
    searchInCache = true,
  ): Promise<TYERestaurant[]> => {
    const coordinates = CityValidator.getCityCoordinates(city);

    if (!coordinates) {
      throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
    }

    const cacheKey = this.buildCacheKey('restaurants', coordinates);

    try {
      // Проверяем кэш
      const cached = await this.cacheService.get<TYERestaurant[]>(cacheKey);

      if (cached && searchInCache) {
        ConsoleLogger.debug('Кэш ресторанов Яндекс.Еда найден', { coordinates, cacheKey });
        return cached.slice(0, 3);
      }

      // Загружаем из API
      ConsoleLogger.debug('Кэш ресторанов Яндекс.Еда не найден, загружаем из API', { coordinates });

      const restaurantsFromServer = await this.requestRestaurants(coordinates);

      // Трансформируем данные
      const restaurants = this.yeDataTransformer.transformRestaurants(restaurantsFromServer, coordinates);

      // Кэшируем результат
      await this.cacheService.set(cacheKey, restaurants, this.cacheTTL.restaurants);

      ConsoleLogger.info('Рестораны Яндекс.Еда загружены и кэшированы', {
        coordinates,
        count: restaurants.length,
        cacheKey,
      });

      return restaurants.slice(0, 3);
    } catch (error) {
      ConsoleLogger.error('Не удалось загрузить рестораны Яндекс.Еда', error as Error, { coordinates });
      throw AppError.apiError(`Не удалось загрузить рестораны Яндекс.Еда для ${city}`, error);
    }
  };

  public requestRestaurantMenu = async (
    restaurantId: string,
    coordinates: TCoordinates,
    brandSlug: string,
  ): Promise<TYEMenuItemFromServer[]> => {
    await this.enforceRateLimit();

    try {
      const headers = {
        ...this.config.headers,
        'x-retpath-y': brandSlug
          ? `https://eda.yandex.ru/r/${brandSlug}?placeSlug=${restaurantId}`
          : `https://eda.yandex.ru/r/${restaurantId}`,
        'x-ya-client-time': new Date().toISOString(),
        'x-ya-coordinates': `latitude=${coordinates.latitude},longitude=${coordinates.longitude}`,
      };

      const url = `/api/v2/menu/retrieve/${restaurantId}?longitude=${coordinates.longitude}&latitude=${coordinates.latitude}&autoTranslate=false`;

      const response = await this.makeRequest<TYEMenuFromServer>(url, {
        method: 'GET',
        headers,
      });

      ConsoleLogger.info('Получено меню ресторана из Яндекс.Еда', {
        restaurantId,
        categoriesCount: response.payload?.categories?.length || 0,
      });

      return response.payload.categories.flatMap(category => category.items);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения меню ресторана из Яндекс.Еда', error as Error, { restaurantId });
      throw AppError.apiError('YANDEX_EDA_MENU_FAILED', 'Не удалось получить меню ресторана Яндекс.Еда');
    }
  };

  public getRestaurantMenu = async (
    restaurantId: string,
    city: EAvailableCities,
    shouldSearchInCache = true,
  ): Promise<TMenuItem[]> => {
    const coordinates = CityValidator.getCityCoordinates(city);
    if (!coordinates) {
      throw AppError.dataCollectionError(`Не удалось получить координаты для города ${city} Яндекс.Еда`);
    }

    const cacheKey = this.buildCacheKey('menu', coordinates, restaurantId);

    try {
      // Проверяем кэш
      const cached = await this.cacheService.get<TMenuItem[]>(cacheKey);
      if (cached && shouldSearchInCache) {
        ConsoleLogger.debug('Кэш меню Яндекс.Еда найден', { restaurantId, coordinates, cacheKey });
        return cached;
      }

      // Нужно получить данные ресторана для трансформации
      const restaurant = await this.getRestaurantById(restaurantId, city);
      if (!restaurant) {
        throw AppError.apiError(`Ресторан Яндекс.Еда не найден для id: ${restaurantId}`);
      }

      // Загружаем из API
      ConsoleLogger.debug('Кэш меню Яндекс.Еда не найден, загружаем из API', { restaurantId, coordinates });
      const yeMenu = await this.requestRestaurantMenu(restaurantId, coordinates, restaurant.additionalInfo.brandSlug);

      // Трансформируем данные
      const menuItems = await this.yeDataTransformer.transformMenu(yeMenu, restaurant);

      void this.menuService.createMenuToRAG(menuItems).catch(error => {
        ConsoleLogger.error('Не удалось сохранить меню в RAG', error as Error, { restaurantId, coordinates });
      });
      if (botConfig.lightRAGEnabled) {
        void this.menuService.createMenuToLightRAG(menuItems).catch(error => {
          ConsoleLogger.error('Не удалось сохранить меню в lightRAG', error as Error, { restaurantId, coordinates });
        });
      }

      // Кэшируем результат
      await this.cacheService.set(cacheKey, menuItems, botConfig.cache.ttlMenu);

      ConsoleLogger.info('Меню Яндекс.Еда загружено и кэшировано', {
        restaurantId,
        coordinates,
        count: menuItems.length,
        cacheKey,
      });

      return menuItems;
    } catch (error) {
      ConsoleLogger.error('Не удалось загрузить меню Яндекс.Еда', error as Error, { restaurantId, coordinates });
      throw AppError.apiError(`Не удалось загрузить меню Яндекс.Еда для ${restaurantId}`, error);
    }
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

  private enforceRateLimit = async (): Promise<void> => {
    while (!this.checkRateLimit()) {
      if (this.rateLimitState.requests.length === 0) {
        break; // Если нет запросов, можно делать новый
      }

      const oldestRequest = Math.min(...this.rateLimitState.requests);
      const waitTime = this.config.rateLimits.windowSizeMs - (Date.now() - oldestRequest);

      if (waitTime > 0) {
        ConsoleLogger.warn('Rate limit достигнут для Яндекс.Еда API, ожидаю', { waitTime });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Записываем текущий запрос
    this.rateLimitState.requests.push(Date.now());

    // Добавляем задержку между запросами
    if (this.config.delayBetweenRequestsMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenRequestsMs));
    }
  };

  private makeRequest = async <T>(endpoint: string, options: RequestInit): Promise<T> => {
    const url = `${this.config.baseUrl}${endpoint}`;
    let lastError: Error | null = null;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        // Подготовка опций для fetch с поддержкой прокси
        const fetchOptions: RequestInit = {
          ...options,
          signal: controller.signal,
        };

        // Добавляем поддержку прокси если настроен
        if (this.config.proxyUrl) {
          const agent = new HttpsProxyAgent(this.config.proxyUrl);
          fetchOptions.agent = agent;
          const proxyUrl = new URL(this.config.proxyUrl);
          proxyUrl.password = '***';
          ConsoleLogger.debug('Используется прокси для запроса', { proxyUrl: proxyUrl.toString() });
        }

        const response = await fetch(url, fetchOptions);

        clearTimeout(timeoutId);

        const processingTimeMs = Date.now() - startTime;

        const data = response.ok ? await response.json() as T : undefined;

        // Логируем успешный запрос
        void this.apiRequestLoggingService.logRequest({
          requestType: this.getRequestType(endpoint),
          endpoint,
          method: options.method || 'GET',
          statusCode: response.status,
          requestData: this.sanitizeRequestData(options.body as string | undefined),
          responseData: response.ok ? this.truncateResponseData(data) : undefined,
          processingTimeMs,
          errorMessage: response.ok ? undefined : `${response.status}: ${response.statusText}`,
        }).catch(error => {
          ConsoleLogger.error('Ошибка логирования API запроса', error as Error, { endpoint });
        });

        if (!response.ok || !data) {
          throw AppError.apiError(`HTTP ${response.status}: ${response.statusText}`, {
            response,
          });
        }

        ConsoleLogger.debug('Яндекс.Еда API запрос выполнен', {
          endpoint,
          attempt,
          status: response.status,
        });

        return data;
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.config.retries) {
          // Логируем неудачный запрос после всех попыток
          const processingTimeMs = Date.now() - startTime;
          void this.apiRequestLoggingService.logRequest({
            requestType: this.getRequestType(endpoint),
            endpoint,
            method: options.method || 'GET',
            statusCode: 0, // Неизвестный статус для сетевых ошибок
            requestData: this.sanitizeRequestData(options.body as string | undefined),
            responseData: undefined,
            processingTimeMs,
            errorMessage: lastError.message,
          }).catch(logError => {
            ConsoleLogger.error('Ошибка логирования неудачного API запроса', logError as Error, { endpoint });
          });
          break;
        }

        // Экспоненциальная задержка между попытками
        const delay = Math.pow(2, attempt) * 1000;
        ConsoleLogger.warn(`Яндекс.Еда API запрос неудачен, повтор через ${delay}ms`, {
          endpoint,
          attempt,
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    ConsoleLogger.error('Яндекс.Еда API запрос окончательно неудачен', lastError!, { endpoint });
    throw AppError.networkError('YANDEX_EDA_REQUEST_FAILED', `Не удалось выполнить запрос: ${lastError?.message}`);
  };

  public clearCache = async (): Promise<void> => {
    try {
      await this.cacheService.clear();
      ConsoleLogger.info('Весь кэш Яндекс.Еда очищен');
    } catch (error) {
      ConsoleLogger.error('Не удалось очистить кэш Яндекс.Еда', error as Error);
      throw AppError.cacheError('Не удалось очистить кэш Яндекс.Еда', error);
    }
  };

  public getCacheStats = async (): Promise<{ restaurants: number; menus: number }> => {
    try {
      // Приблизительная статистика по типам кэша
      // В реальности нужно было бы отслеживать это более точно
      const stats = await this.cacheService.getStats();

      return {
        restaurants: Math.floor(stats.totalKeys * 0.1), // ~10% ключей - рестораны
        menus: Math.floor(stats.totalKeys * 0.9), // ~90% ключей - меню
      };
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

  public getRestaurantById = async (
    restaurantId: string,
    city: EAvailableCities,
  ): Promise<TYERestaurant | null> => {
    try {
      const restaurants = await this.getRestaurants(city);
      return restaurants.find(r => r.id === restaurantId) || null;
    } catch (error) {
      ConsoleLogger.error('Не удалось получить ресторан Яндекс.Еда по slug', error as Error, { restaurantId, city });
      return null;
    }
  };

  private getRequestType = (endpoint: string): EApiRequestType => {
    if (endpoint.includes('/layout-constructor')) {
      return EApiRequestType.YANDEX_EDA_RESTAURANTS;
    }
    if (endpoint.includes('/menu/retrieve')) {
      return EApiRequestType.YANDEX_EDA_MENU;
    }
    return EApiRequestType.YANDEX_EDA_PLACE;
  };

  private sanitizeRequestData = (body: string | undefined): Record<string, unknown> | undefined => {
    if (!body) return undefined;

    try {
      const data = JSON.parse(body) as Record<string, unknown>;
      // Удаляем чувствительные данные
      if (data.location) {
        return { location: data.location };
      }
      if (data.restaurantId) {
        return { restaurantId: data.restaurantId };
      }
      return data;
    } catch {
      return { rawBody: '[PARSE_ERROR]' };
    }
  };

  private truncateResponseData = (data: unknown): Record<string, unknown> => {
    const stringified = JSON.stringify(data);
    if (stringified.length > 1000) {
      return { truncated: true, size: stringified.length };
    }
    return data as Record<string, unknown>;
  };
}
