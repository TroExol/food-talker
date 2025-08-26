import { createClient, type RedisClientType } from 'redis';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { environment } from '@/config/environment';

import type { TCacheProvider, TCacheProviderStats } from './types';
import type { TCacheConfig } from '../types';

export class RedisCacheProvider implements TCacheProvider {
  private readonly client: RedisClientType;
  private readonly config: TCacheConfig;
  private hits = 0;
  private misses = 0;
  private isConnected = false;
  private isConnecting = false;

  constructor(config: TCacheConfig) {
    this.config = config;

    if (!environment.REDIS_URL) {
      throw AppError.cacheError('Redis URL обязателен для Redis cache provider');
    }

    this.client = createClient({
      url: environment.REDIS_URL,
      socket: {
        reconnectStrategy: retries => {
          ConsoleLogger.warn('Redis переподключение', { attempt: retries });
          return Math.min(retries * 50, 1000);
        },
      },
    });

    this.setupEventHandlers();
  }

  public async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        return;
      }

      this.isConnecting = true;
      await this.client.connect();
      this.isConnected = true;
      ConsoleLogger.info('Redis клиент подключен');
    } catch (error) {
      this.isConnecting = false;
      ConsoleLogger.error('Ошибка подключения к Redis', error as Error);
      throw AppError.cacheError('Не удалось подключиться к Redis', error);
    } finally {
      this.isConnecting = false;
    }
  }

  public get = async <T>(key: string): Promise<T | null> => {
    try {
      await this.ensureConnected();

      const value = await this.client.get(key);

      if (value === null) {
        this.misses++;
        ConsoleLogger.debug('Redis cache не найден', { key });
        return null;
      }

      this.hits++;
      ConsoleLogger.debug('Redis кэш найден', { key });

      return JSON.parse(value) as T;
    } catch (error) {
      ConsoleLogger.error('Ошибка получения Redis кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось получить Redis кэш по ключу: ${key}`, error);
    }
  };

  public set = async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
    try {
      await this.ensureConnected();

      const ttl = ttlSeconds ?? this.config.ttl;
      const serializedValue = JSON.stringify(value);

      if (ttl === 0) {
        await this.client.set(key, serializedValue);
      } else {
        await this.client.setEx(key, ttl, serializedValue);
      }

      ConsoleLogger.debug('Redis кэш установлен', { key, ttl });
    } catch (error) {
      ConsoleLogger.error('Ошибка установки Redis кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось установить Redis кэш по ключу: ${key}`, error);
    }
  };

  public delete = async (key: string): Promise<void> => {
    try {
      await this.ensureConnected();

      const deleted = await this.client.del(key);
      ConsoleLogger.debug('Redis кэш удален', { key, deleted: deleted > 0 });
    } catch (error) {
      ConsoleLogger.error('Ошибка удаления Redis кэша', error as Error, { key });
      throw AppError.cacheError(`Не удалось удалить Redis кэш по ключу: ${key}`, error);
    }
  };

  public clear = async (): Promise<void> => {
    try {
      await this.ensureConnected();

      // Получаем количество ключей для логирования
      const keysCount = await this.client.dbSize();

      await this.client.flushDb();
      this.hits = 0;
      this.misses = 0;

      ConsoleLogger.info('Redis кэш очищен', { previousSize: keysCount });
    } catch (error) {
      ConsoleLogger.error('Ошибка очистки Redis кэша', error as Error);
      throw AppError.cacheError('Не удалось очистить Redis кэш', error);
    }
  };

  public has = async (key: string): Promise<boolean> => {
    try {
      await this.ensureConnected();

      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      ConsoleLogger.error('Ошибка проверки Redis кэша', error as Error, { key });
      return false;
    }
  };

  public getStats = async (): Promise<TCacheProviderStats> => {
    try {
      await this.ensureConnected();

      const info = await this.client.info('memory');
      const totalKeys = await this.client.dbSize();
      const totalRequests = this.hits + this.misses;

      // Парсим используемую память из INFO команды
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;

      return {
        totalKeys,
        memoryUsage,
        hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
        missRate: totalRequests > 0 ? this.misses / totalRequests : 0,
      };
    } catch (error) {
      ConsoleLogger.error('Ошибка получения статистики Redis кэша', error as Error);
      throw AppError.cacheError('Не удалось получить статистику Redis кэша', error);
    }
  };

  public close = async (): Promise<void> => {
    try {
      if (this.isConnected) {
        await this.client.quit();
        this.isConnected = false;
        ConsoleLogger.info('Redis cache provider закрыт');
      }
    } catch (error) {
      ConsoleLogger.error('Ошибка закрытия Redis cache provider', error as Error);
    }
  };

  private setupEventHandlers = (): void => {
    this.client.on('error', error => {
      ConsoleLogger.error('Redis клиент ошибка', error as Error);
      this.isConnected = false;
      this.isConnecting = false;
    });

    this.client.on('connect', () => {
      ConsoleLogger.info('Redis клиент подключается');
    });

    this.client.on('ready', () => {
      ConsoleLogger.info('Redis клиент готов');
      this.isConnected = true;
      this.isConnecting = false;
    });

    this.client.on('end', () => {
      ConsoleLogger.info('Redis соединение закрыто');
      this.isConnected = false;
      this.isConnecting = false;
    });

    this.client.on('reconnecting', () => {
      ConsoleLogger.info('Redis переподключается');
      this.isConnecting = true;
    });
  };

  private ensureConnected = async (): Promise<void> => {
    if (!this.isConnected && !this.isConnecting) {
      await this.connect();
    }
  };
}
