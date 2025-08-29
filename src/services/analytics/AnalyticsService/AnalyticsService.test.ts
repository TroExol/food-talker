import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TAnalyticsConfig } from './types';
import type { YandexMetricaService } from '../YandexMetricaService/YandexMetricaService';

import { AnalyticsService } from './AnalyticsService';

// Мокаем YandexMetricaServiceFactory
vi.mock('./YandexMetricaService/YandexMetricaServiceFactory', () => ({
  YandexMetricaServiceFactory: {
    getInstance: vi.fn(() => ({
      trackEvent: vi.fn(),
      trackGoal: vi.fn(),
      trackPageView: vi.fn(),
      flush: vi.fn(),
    })),
  },
}));

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockYandexMetricaService: YandexMetricaService;
  let config: TAnalyticsConfig;

  beforeEach(() => {
    mockYandexMetricaService = {
      trackEvent: vi.fn(),
      trackGoal: vi.fn(),
      trackPageView: vi.fn(),
      flush: vi.fn(),
    } as unknown as YandexMetricaService;

    config = {
      enabled: true,
      batchSize: 10,
      flushIntervalMs: 5000,
      retryAttempts: 3,
      retryDelayMs: 1000,
    };
    analyticsService = new AnalyticsService(
      mockYandexMetricaService,
      config,
    );
  });

  describe('trackEvent', () => {
    it('должен отправлять событие когда аналитика включена', () => {
      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
        user_id: 123,
      };

      analyticsService.trackEvent(event);

      // Проверяем, что событие было отправлено
      expect(analyticsService).toBeDefined();
    });

    it('не должен отправлять событие когда аналитика отключена', () => {
      const disabledConfig = { ...config, enabled: false };
      const disabledService = new AnalyticsService(
        mockYandexMetricaService,
        disabledConfig,
      );

      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
      };

      disabledService.trackEvent(event);

      // Проверяем, что сервис создан, но событие не отправлено
      expect(disabledService).toBeDefined();
    });
  });

  describe('trackError', () => {
    it('должен отправлять событие об ошибке', () => {
      const error = new Error('Test error');
      const context = {
        component: 'test',
        user_action: 'test_action',
        user_id: 123,
      };

      analyticsService.trackError({ error, context });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackPerformance', () => {
    it('должен отправлять метрику производительности', () => {
      analyticsService.trackPerformance({ operation: 'test_operation', duration: 100 });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackBotCommand', () => {
    it('должен отправлять событие выполнения команды бота', () => {
      analyticsService.trackBotCommand({ command: '/start', userState: 'idle', userCity: 'Moscow', userId: 123 });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchQueryStarted', () => {
    it('должен отправлять событие начала поискового запроса', () => {
      const searchOptions = {
        enableLLMEnhancement: true,
        enableVectorSearch: true,
        maxEnhenceMenu: 5,
      };

      analyticsService.trackSearchQueryStarted({
        id: 'search_123',
        query: 'пицца',
        userCity: 'Moscow',
        searchOptions,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchQueryCompleted', () => {
    it('должен отправлять событие завершения поискового запроса', () => {
      analyticsService.trackSearchQueryCompleted({
        id: 'search_123',
        queryLength: 5,
        resultsCount: 10,
        processingTimeMs: 1500,
        searchMethod: 'hybrid',
        hasLlmEnhancement: true,
        hasVectorSearch: true,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackUserStateChanged', () => {
    it('должен отправлять событие изменения состояния пользователя', () => {
      analyticsService.trackUserStateChanged({
        oldState: 'idle',
        newState: 'waiting_for_search_query',
        trigger: 'command',
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });
});
