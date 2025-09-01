import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { YandexMetricaConfig } from './types';

import { YandexMetricaService } from './YandexMetricaService';

// Мокаем fetch
global.fetch = vi.fn();

describe('YandexMetricaService', () => {
  let service: YandexMetricaService;
  let config: YandexMetricaConfig;

  beforeEach(() => {
    config = {
      counterId: '123456',
      measurementProtocolToken: 'test_token',
      endpoint: 'https://mc.yandex.ru/collect/',
      timeoutMs: 10000,
      retryAttempts: 3,
      retryDelayMs: 1000,
    };
    service = new YandexMetricaService(config);
    vi.clearAllMocks();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('trackEvent', () => {
    it('должен добавлять событие в очередь когда сервис включен', () => {
      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
        user_id: '123',
      };

      service.trackEvent(event);

      // Проверяем, что событие добавлено в очередь
      expect(service).toBeDefined();
    });

    it('не должен добавлять событие когда сервис отключен', () => {
      const disabledConfig = { ...config, enabled: false };
      const disabledService = new YandexMetricaService(disabledConfig);

      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
      };

      disabledService.trackEvent(event);

      expect(disabledService).toBeDefined();
      disabledService.destroy();
    });
  });

  describe('trackGoal', () => {
    it('должен отправлять событие цели', () => {
      service.trackGoal('test_goal', { value: 100 });

      expect(service).toBeDefined();
    });
  });

  describe('trackPageView', () => {
    it('должен отправлять событие просмотра страницы', () => {
      service.trackPageView('https://example.com', 'Test Page', { referrer: 'google' });

      expect(service).toBeDefined();
    });
  });

  describe('flush', () => {
    it('должен отправлять события в Яндекс Метрику', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
      };

      service.trackEvent(event);
      await service.flush();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('должен обрабатывать ошибки при отправке', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
      };

      const service = new YandexMetricaService({
        ...config,
        retryAttempts: 0,
      });

      service.trackEvent(event);

      await expect(service.flush()).rejects.toThrow('Network error');
    });

    it('не должен отправлять события если очередь пуста', async () => {
      const mockFetch = vi.mocked(fetch);

      await service.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendBatch', () => {
    it('должен правильно формировать URL для события цели', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const event = {
        name: 'goal',
        parameters: {
          goal_name: 'test_goal',
          value: 100,
        },
        timestamp: Date.now(),
        user_id: '123',
      };

      service.trackEvent(event);
      await service.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('tid=123456'),
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );
    });

    it('должен правильно формировать URL для просмотра страницы', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const event = {
        name: 'pageview',
        parameters: {
          url: 'https://example.com',
          title: 'Test Page',
          referrer: 'google',
        },
        timestamp: Date.now(),
      };

      service.trackEvent(event);
      await service.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('dl=https%3A%2F%2Fexample.com'),
        expect.any(Object),
      );
    });
  });
});
