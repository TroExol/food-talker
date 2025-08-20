import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { MOCKED_CURRENT_DATE } from '@/vitest/constants';

import { CacheService, type TCacheServiceConfig } from './CacheService';

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockConfig: TCacheServiceConfig;

  beforeEach(() => {
    vi.useFakeTimers();

    mockConfig = {
      ttl: 300, // 5 минут
      maxSize: 3,
      type: 'memory',
    };

    cacheService = new CacheService(mockConfig);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cacheService.close();
  });

  describe('get/set operations', () => {
    it('должен сохранить и получить значение', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      await cacheService.set(key, value);
      const result = await cacheService.get(key);

      expect(result).toEqual(value);
    });

    it('должен вернуть null для несуществующего ключа', async () => {
      const result = await cacheService.get('non-existent');
      expect(result).toBeNull();
    });

    it('должен использовать TTL по умолчанию', async () => {
      const key = 'ttl-test';
      const value = 'test-data';

      await cacheService.set(key, value);

      // Проверяем что значение есть
      expect(await cacheService.get(key)).toBe(value);

      // Перематываем время на 6 минут (больше TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Значение должно быть просрочено
      expect(await cacheService.get(key)).toBeNull();
    });

    it('должен использовать кастомный TTL', async () => {
      const key = 'custom-ttl-test';
      const value = 'test-data';
      const customTTL = 10; // 10 секунд

      await cacheService.set(key, value, customTTL);

      // Перематываем время на 5 секунд (меньше TTL)
      vi.advanceTimersByTime(5 * 1000);
      expect(await cacheService.get(key)).toBe(value);

      // Перематываем время на 15 секунд (больше TTL)
      vi.advanceTimersByTime(15 * 1000);
      expect(await cacheService.get(key)).toBeNull();
    });
  });

  describe('delete operation', () => {
    it('должен удалить значение по ключу', async () => {
      const key = 'delete-test';
      const value = 'test-value';

      await cacheService.set(key, value);
      expect(await cacheService.get(key)).toBe(value);

      await cacheService.delete(key);
      expect(await cacheService.get(key)).toBeNull();
    });
  });

  describe('has operation', () => {
    it('должен проверить существование ключа', async () => {
      const key = 'has-test';
      const value = 'test-value';

      expect(await cacheService.has(key)).toBe(false);

      await cacheService.set(key, value);
      expect(await cacheService.has(key)).toBe(true);

      await cacheService.delete(key);
      expect(await cacheService.has(key)).toBe(false);
    });

    it('должен вернуть false для просроченного ключа', async () => {
      const key = 'expired-test';
      const value = 'test-value';

      await cacheService.set(key, value, 10); // 10 секунд TTL
      expect(await cacheService.has(key)).toBe(true);

      // Перематываем время на 15 секунд
      vi.advanceTimersByTime(15 * 1000);
      expect(await cacheService.has(key)).toBe(false);
    });
  });

  describe('clear operation', () => {
    it('должен очистить весь кэш', async () => {
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');
      await cacheService.set('key3', 'value3');

      expect(await cacheService.has('key1')).toBe(true);
      expect(await cacheService.has('key2')).toBe(true);
      expect(await cacheService.has('key3')).toBe(true);

      await cacheService.clear();

      expect(await cacheService.has('key1')).toBe(false);
      expect(await cacheService.has('key2')).toBe(false);
      expect(await cacheService.has('key3')).toBe(false);
    });
  });

  describe('getStats operation', () => {
    it('должен вернуть статистику кэша', async () => {
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');

      // Делаем несколько get запросов для статистики
      await cacheService.get('key1');
      await cacheService.get('key1');
      await cacheService.get('non-existent');

      const stats = await cacheService.getStats();

      expect(stats.totalKeys).toBe(2);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.missRate).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('LRU eviction', () => {
    it('должен удалить самый старый элемент при превышении maxSize', async () => {
      // Заполняем кэш до максимума
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');
      await cacheService.set('key3', 'value3');

      vi.setSystemTime(MOCKED_CURRENT_DATE.getTime() + 1000);

      // Обращаемся к key1 чтобы обновить lastAccessed
      await cacheService.get('key1');

      // Перематываем время чтобы key2 стал самым старым
      vi.advanceTimersByTime(1000);

      // Добавляем новый ключ, что должно вытеснить key2
      await cacheService.set('key4', 'value4');

      expect(await cacheService.has('key1')).toBe(true); // недавно использовался
      expect(await cacheService.has('key2')).toBe(false); // должен быть удален (LRU)
      expect(await cacheService.has('key3')).toBe(true);
      expect(await cacheService.has('key4')).toBe(true); // новый
    });
  });

  describe('automatic cleanup', () => {
    it('должен автоматически удалять просроченные записи', async () => {
      await cacheService.set('short-ttl', 'value', 10); // 10 секунд
      await cacheService.set('long-ttl', 'value', 600); // 10 минут

      expect(await cacheService.has('short-ttl')).toBe(true);
      expect(await cacheService.has('long-ttl')).toBe(true);

      // Перематываем время на 15 секунд
      vi.advanceTimersByTime(15 * 1000);

      // Запускаем cleanup (обычно происходит каждые 5 минут)
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(await cacheService.has('short-ttl')).toBe(false);
      expect(await cacheService.has('long-ttl')).toBe(true);
    });
  });
});
