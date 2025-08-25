import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AsyncRequestManager } from './AsyncRequestManager';

describe('AsyncRequestManager', () => {
  let manager: AsyncRequestManager;

  beforeEach(() => {
    manager = new AsyncRequestManager(2); // Максимум 2 одновременных запроса
  });

  describe('parallel execution', () => {
    it('должен выполнять запросы параллельно в пределах лимита', async () => {
      vi.useRealTimers();
      const results: number[] = [];
      const executionOrder: string[] = [];

      const createRequest = (id: string, delay: number, result: number) => async () => {
        executionOrder.push(`start_${id}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        executionOrder.push(`end_${id}`);
        results.push(result);
        return result;
      };

      const startTime = Date.now();

      // Запускаем 4 запроса одновременно
      const promises = [
        manager.executeRequest('req1', createRequest('req1', 100, 1)),
        manager.executeRequest('req2', createRequest('req2', 50, 2)),
        manager.executeRequest('req3', createRequest('req3', 75, 3)),
        manager.executeRequest('req4', createRequest('req4', 25, 4)),
      ];

      const results2 = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Проверяем результаты
      expect(results2).toEqual([1, 2, 3, 4]);
      expect(results).toHaveLength(4);

      // Проверяем, что запросы выполнялись параллельно (но не более 2 одновременно)
      expect(executionOrder).toHaveLength(8); // 4 start + 4 end

      // Проверяем, что общее время меньше суммы всех задержек
      const totalSequentialTime = 100 + 50 + 75 + 25; // 250ms
      expect(duration).toBeLessThan(totalSequentialTime);
      expect(duration).toBeLessThan(300); // Ожидаем время около 200ms при параллельном выполнении
    }, 10000);

    it('должен обрабатывать ошибки в запросах', async () => {
      const successRequest = vi.fn().mockResolvedValue('success');
      const errorRequest = vi.fn().mockRejectedValue(new Error('Test error'));

      const successPromise = manager.executeRequest('success', successRequest);
      const errorPromise = manager.executeRequest('error', errorRequest);

      await expect(successPromise).resolves.toBe('success');
      await expect(errorPromise).rejects.toThrow('Test error');

      expect(successRequest).toHaveBeenCalledTimes(1);
      expect(errorRequest).toHaveBeenCalledTimes(1);
    });

    it('должен возвращать статистику', () => {
      const stats = manager.getStats();

      expect(stats).toEqual({
        activeRequests: 0,
        maxConcurrentRequests: 2,
      });
    });
  });

  describe('concurrency limits', () => {
    it('должен соблюдать лимит одновременных запросов', async () => {
      vi.useRealTimers();
      const activeRequests: number[] = [];
      let maxActive = 0;

      const createRequest = (id: number) => async () => {
        const current = activeRequests.length;
        activeRequests.push(current);
        maxActive = Math.max(maxActive, current + 1);
        await new Promise(resolve => setTimeout(resolve, 50));
        activeRequests.pop();
        return id;
      };

      // Запускаем больше запросов, чем лимит
      const promises = Array.from({ length: 5 }, (_, i) =>
        manager.executeRequest(`req${i}`, createRequest(i)),
      );

      await Promise.all(promises);

      // Проверяем, что никогда не было больше 2 активных запросов
      expect(maxActive).toBeLessThanOrEqual(2);
    }, 10000);
  });
});
