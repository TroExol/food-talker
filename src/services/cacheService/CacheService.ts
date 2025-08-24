import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

import type {
  TCacheService,
  TCacheServiceConfig,
  TCacheStats,
} from './types';
import type { TCacheProvider } from './providers/types';

import { RedisCacheProvider } from './providers/RedisCacheProvider';
import { MemoryCacheProvider } from './providers/MemoryCacheProvider/MemoryCacheProvider';

export class CacheService implements TCacheService {
  private readonly provider: TCacheProvider;

  constructor(config: TCacheServiceConfig) {
    this.provider = this.createProvider(config);
  }

  public get = async <T>(key: string): Promise<T | null> => {
    try {
      return await this.provider.get<T>(key);
    } catch (error) {
      logger.error('Ошибка получения кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось получить кэш по ключу: ${key}`, error);
    }
  };

  public set = async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
    try {
      await this.provider.set(key, value, ttlSeconds);
    } catch (error) {
      logger.error('Ошибка установки кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось установить кэш по ключу: ${key}`, error);
    }
  };

  public delete = async (key: string): Promise<void> => {
    try {
      await this.provider.delete(key);
    } catch (error) {
      logger.error('Ошибка удаления кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось удалить кэш по ключу: ${key}`, error);
    }
  };

  public clear = async (): Promise<void> => {
    try {
      await this.provider.clear();
    } catch (error) {
      logger.error('Ошибка очистки кэша', error as Error);
      throw AppError.cacheError('Не удалось очистить кэш', error);
    }
  };

  public has = async (key: string): Promise<boolean> => {
    try {
      return await this.provider.has(key);
    } catch (error) {
      logger.error('Ошибка проверки кэша', error as Error, { key });
      return false;
    }
  };

  public getStats = async (): Promise<TCacheStats> => {
    try {
      return await this.provider.getStats();
    } catch (error) {
      logger.error('Ошибка получения статистики кэша', error as Error);
      throw AppError.cacheError('Не удалось получить статистику кэша', error);
    }
  };

  public close = async (): Promise<void> => {
    try {
      await this.provider.close();
      logger.info('CacheService закрыт');
    } catch (error) {
      logger.error('Ошибка закрытия CacheService', error as Error);
      throw AppError.cacheError('Не удалось закрыть CacheService', error);
    }
  };

  private createProvider = (config: TCacheServiceConfig): TCacheProvider => {
    switch (config.type) {
      case 'memory':
        logger.info('Создан Memory cache provider');
        return new MemoryCacheProvider(config);

      case 'redis': {
        logger.info('Создан Redis cache provider', { redisUrl: config.redisUrl });
        const redisProvider = new RedisCacheProvider(config);

        // Инициализируем подключение к Redis
        redisProvider.connect().catch(error => {
          logger.error('Ошибка подключения к Redis при создании provider', error as Error);
        });

        return redisProvider;
      }

      default:
        throw AppError.cacheError(`Неподдерживаемый тип кэша: ${config.type as string}`);
    }
  };
}
