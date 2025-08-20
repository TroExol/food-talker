import type { TCacheConfig } from '@/config/bot';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

import type { TCacheProvider, TCacheProviderStats } from './baseCacheProvider';

interface TMemoryCacheItem<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

export class MemoryCacheProvider implements TCacheProvider {
  private readonly cache = new Map<string, TMemoryCacheItem<unknown>>();
  private readonly config: TCacheConfig;
  private hits = 0;
  private misses = 0;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: TCacheConfig) {
    this.config = config;

    // Запускаем очистку просроченных записей каждые 5 минут
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  public get = <T>(key: string): Promise<T | null> => {
    try {
      const item = this.cache.get(key);

      if (!item) {
        this.misses++;
        logger.debug('Memory cache не найден', { key });
        return Promise.resolve(null);
      }

      // Проверяем срок действия
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        this.misses++;
        logger.debug('Memory кэш просрочен', { key });
        return Promise.resolve(null);
      }

      // Обновляем статистику доступа
      item.accessCount++;
      item.lastAccessed = Date.now();
      this.hits++;

      logger.debug('Memory кэш найден', { key });
      return Promise.resolve(item.value as T);
    } catch (error) {
      logger.error('Ошибка получения memory кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось получить memory кэш по ключу: ${key}`, error);
    }
  };

  public set = async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
    try {
      const ttl = ttlSeconds ?? this.config.ttl;
      const expiresAt = Date.now() + (ttl * 1000);

      // Проверяем лимит размера кэша
      if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
        await this.evictLRU();
      }

      this.cache.set(key, {
        value,
        expiresAt,
        accessCount: 0,
        lastAccessed: Date.now(),
      });

      logger.debug('Memory кэш установлен', { key, ttl });
    } catch (error) {
      logger.error('Ошибка установки memory кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось установить memory кэш по ключу: ${key}`, error);
    }
  };

  public delete = (key: string): Promise<void> => {
    try {
      const deleted = this.cache.delete(key);
      logger.debug('Memory кэш удален', { key, deleted });
      return Promise.resolve();
    } catch (error) {
      logger.error('Ошибка удаления memory кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось удалить memory кэш по ключу: ${key}`, error);
    }
  };

  public clear = (): Promise<void> => {
    try {
      const size = this.cache.size;
      this.cache.clear();
      this.hits = 0;
      this.misses = 0;
      logger.info('Memory кэш очищен', { previousSize: size });
      return Promise.resolve();
    } catch (error) {
      logger.error('Ошибка очистки memory кэша', error as Error);
      throw AppError.cacheError('Не удалось очистить memory кэш', error);
    }
  };

  public has = (key: string): Promise<boolean> => {
    try {
      const item = this.cache.get(key);
      if (!item) return Promise.resolve(false);

      // Проверяем срок действия
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        return Promise.resolve(false);
      }

      return Promise.resolve(true);
    } catch (error) {
      logger.error('Ошибка проверки memory кэша', error as Error, { key });
      return Promise.resolve(false);
    }
  };

  public getStats = (): Promise<TCacheProviderStats> => {
    try {
      const totalRequests = this.hits + this.misses;
      const memoryUsage = this.estimateMemoryUsage();

      return Promise.resolve({
        totalKeys: this.cache.size,
        memoryUsage,
        hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
        missRate: totalRequests > 0 ? this.misses / totalRequests : 0,
      });
    } catch (error) {
      logger.error('Ошибка получения статистики memory кэша', error as Error);
      throw AppError.cacheError('Не удалось получить статистику memory кэша', error);
    }
  };

  public close = (): Promise<void> => {
    try {
      clearInterval(this.cleanupInterval);
      this.cache.clear();
      logger.info('Memory cache provider закрыт');
    } catch (error) {
      logger.error('Ошибка закрытия memory cache provider', error as Error);
    }
    return Promise.resolve();
  };

  private cleanupExpired = (): void => {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, item] of this.cache.entries()) {
        if (now > item.expiresAt) {
          this.cache.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Memory кэш очистка завершена', { cleanedCount, remainingKeys: this.cache.size });
      }
    } catch (error) {
      logger.error('Ошибка очистки memory кэша', error as Error);
    }
  };

  private evictLRU = (): Promise<void> => {
    try {
      let oldestKey: string | null = null;
      let oldestTime = Date.now();

      // Находим самый старый элемент по времени последнего доступа
      for (const [key, item] of this.cache.entries()) {
        if (item.lastAccessed < oldestTime) {
          oldestTime = item.lastAccessed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug('Memory LRU удаление', { evictedKey: oldestKey });
      }

      return Promise.resolve();
    } catch (error) {
      logger.error('Ошибка удаления memory LRU', error as Error);
      throw AppError.cacheError('Не удалось удалить memory LRU элемент', error);
    }
  };

  private estimateMemoryUsage = (): number => {
    try {
      let totalSize = 0;

      for (const [key, item] of this.cache.entries()) {
        // Приблизительная оценка размера
        totalSize += key.length * 2; // Unicode characters
        totalSize += JSON.stringify(item.value).length * 2;
        totalSize += 32; // Metadata (timestamps, counters)
      }

      return totalSize;
    } catch (error) {
      logger.error('Ошибка оценки памяти memory кэша', error as Error);
      return 0;
    }
  };
}
