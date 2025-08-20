import type { TCacheConfig } from '@/config/bot';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

interface TCacheService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSeconds?: number): void;
  delete(key: string): void;
  clear(): void;
  has(key: string): boolean;
  getStats(): TCacheStats;
}

export interface TCacheStats {
  totalKeys: number;
  memoryUsage: number; // bytes
  hitRate: number; // 0-1
  missRate: number; // 0-1
}

interface TCacheItem<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

export class CacheService implements TCacheService {
  private readonly cache = new Map<string, TCacheItem<unknown>>();
  private readonly config: TCacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: TCacheConfig) {
    this.config = config;

    // Запускаем очистку просроченных записей каждые 5 минут
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  public get = <T>(key: string): T | null => {
    try {
      const item = this.cache.get(key);

      if (!item) {
        this.misses++;
        logger.debug('Cache не найден', { key });
        return null;
      }

      // Проверяем срок действия
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        this.misses++;
        logger.debug('Кэш просрочен', { key });
        return null;
      }

      // Обновляем статистику доступа
      item.accessCount++;
      item.lastAccessed = Date.now();
      this.hits++;

      logger.debug('Кэш найден', { key });
      return item.value as T;
    } catch (error) {
      logger.error('Ошибка получения кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось получить кэш по ключу: ${key}`, error);
    }
  };

  public set = <T>(key: string, value: T, ttlSeconds?: number): void => {
    try {
      const ttl = ttlSeconds ?? this.config.ttl;
      const expiresAt = Date.now() + (ttl * 1000);

      // Проверяем лимит размера кэша
      if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
        this.evictLRU();
      }

      this.cache.set(key, {
        value,
        expiresAt,
        accessCount: 0,
        lastAccessed: Date.now(),
      });

      logger.debug('Кэш установлен', { key, ttl });
    } catch (error) {
      logger.error('Ошибка установки кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось установить кэш по ключу: ${key}`, error);
    }
  };

  public delete = (key: string): void => {
    try {
      const deleted = this.cache.delete(key);
      logger.debug('Кэш удален', { key, deleted });
    } catch (error) {
      logger.error('Ошибка удаления кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось удалить кэш по ключу: ${key}`, error);
    }
  };

  public clear = (): void => {
    try {
      const size = this.cache.size;
      this.cache.clear();
      this.hits = 0;
      this.misses = 0;
      logger.info('Кэш очищен', { previousSize: size });
    } catch (error) {
      logger.error('Ошибка очистки кэша', error as Error);
      throw AppError.cacheError('Не удалось очистить кэш', error);
    }
  };

  public has = (key: string): boolean => {
    try {
      const item = this.cache.get(key);
      if (!item) return false;

      // Проверяем срок действия
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Ошибка проверки кэша', error as Error, { key });
      return false;
    }
  };

  public getStats = (): TCacheStats => {
    try {
      const totalRequests = this.hits + this.misses;
      const memoryUsage = this.estimateMemoryUsage();

      return {
        totalKeys: this.cache.size,
        memoryUsage,
        hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
        missRate: totalRequests > 0 ? this.misses / totalRequests : 0,
      };
    } catch (error) {
      logger.error('Ошибка получения статистики кэша', error as Error);
      throw AppError.cacheError('Не удалось получить статистику кэша', error);
    }
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
        logger.debug('Очистка кэша завершена', { cleanedCount, remainingKeys: this.cache.size });
      }
    } catch (error) {
      logger.error('Ошибка очистки кэша', error as Error);
    }
  };

  private evictLRU = (): void => {
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
        logger.debug('Удаление LRU', { evictedKey: oldestKey });
      }
    } catch (error) {
      logger.error('Ошибка удаления LRU', error as Error);
      throw AppError.cacheError('Не удалось удалить LRU элемент', error);
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
      logger.error('Ошибка оценки памяти', error as Error);
      return 0;
    }
  };
}
