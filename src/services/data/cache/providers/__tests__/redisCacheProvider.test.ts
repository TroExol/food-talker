import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TCacheConfig } from '@/config/bot';

import { RedisCacheProvider } from '../redisCacheProvider';

// Мокируем Redis клиент
const mockRedisClient = {
  connect: vi.fn(),
  quit: vi.fn(),
  get: vi.fn(),
  setEx: vi.fn(),
  del: vi.fn(),
  flushDb: vi.fn(),
  exists: vi.fn(),
  dbSize: vi.fn(),
  info: vi.fn(),
  on: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

describe('RedisCacheProvider', () => {
  let redisCacheProvider: RedisCacheProvider;
  let mockConfig: TCacheConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      ttl: 300, // 5 минут
      maxSize: 100,
      redisUrl: 'redis://localhost:6379',
    };

    redisCacheProvider = new RedisCacheProvider(mockConfig);
  });

  afterEach(async () => {
    await redisCacheProvider.close();
  });

  describe('constructor', () => {
    it('должен создать Redis клиент с правильными настройками', () => {
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('end', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });

    it('должен выбросить ошибку если нет Redis URL', () => {
      const configWithoutUrl = { ...mockConfig, redisUrl: undefined };

      expect(() => new RedisCacheProvider(configWithoutUrl)).toThrow();
    });
  });

  describe('get/set operations', () => {
    beforeEach(() => {
      mockRedisClient.connect.mockResolvedValue(undefined);
    });

    it('должен сохранить и получить значение', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      const serializedValue = JSON.stringify(value);

      mockRedisClient.get.mockResolvedValue(serializedValue);

      await redisCacheProvider.set(key, value);
      const result = await redisCacheProvider.get(key);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(key, mockConfig.ttl, serializedValue);
      expect(result).toEqual(value);
    });

    it('должен вернуть null для несуществующего ключа', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await redisCacheProvider.get('non-existent');

      expect(result).toBeNull();
    });

    it('должен использовать кастомный TTL', async () => {
      const key = 'custom-ttl-test';
      const value = 'test-data';
      const customTTL = 10;

      await redisCacheProvider.set(key, value, customTTL);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(key, customTTL, JSON.stringify(value));
    });
  });

  describe('delete operation', () => {
    beforeEach(() => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      // Не вызываем connect() здесь - он будет вызван автоматически в ensureConnected()
    });

    it('должен удалить значение по ключу', async () => {
      const key = 'delete-test';
      mockRedisClient.del.mockResolvedValue(1);

      await redisCacheProvider.delete(key);

      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
    });
  });

  describe('has operation', () => {
    beforeEach(() => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      // Не вызываем connect() здесь - он будет вызван автоматически в ensureConnected()
    });

    it('должен проверить существование ключа', async () => {
      const key = 'has-test';

      mockRedisClient.exists.mockResolvedValue(1);
      expect(await redisCacheProvider.has(key)).toBe(true);

      mockRedisClient.exists.mockResolvedValue(0);
      expect(await redisCacheProvider.has(key)).toBe(false);
    });
  });

  describe('clear operation', () => {
    beforeEach(() => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      // Не вызываем connect() здесь - он будет вызван автоматически в ensureConnected()
    });

    it('должен очистить весь кэш', async () => {
      mockRedisClient.dbSize.mockResolvedValue(5);
      mockRedisClient.flushDb.mockResolvedValue('OK');

      await redisCacheProvider.clear();

      expect(mockRedisClient.flushDb).toHaveBeenCalled();
    });
  });

  describe('getStats operation', () => {
    beforeEach(() => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      // Не вызываем connect() здесь - он будет вызван автоматически в ensureConnected()
    });

    it('должен вернуть статистику кэша', async () => {
      mockRedisClient.info.mockResolvedValue('used_memory:1024\nother_info:value');
      mockRedisClient.dbSize.mockResolvedValue(10);

      const stats = await redisCacheProvider.getStats();

      expect(stats.totalKeys).toBe(10);
      expect(stats.memoryUsage).toBe(1024);
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.missRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('connection management', () => {
    it('должен подключиться к Redis', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      await redisCacheProvider.connect();

      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('должен закрыть соединение с Redis', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.quit.mockResolvedValue('OK');

      await redisCacheProvider.connect();
      await redisCacheProvider.close();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('должен обработать ошибку подключения', async () => {
      const connectionError = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(connectionError);

      await expect(redisCacheProvider.connect()).rejects.toThrow();
    });
  });
});
