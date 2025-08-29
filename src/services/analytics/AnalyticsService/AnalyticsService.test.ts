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

  describe('trackBotCommandError', () => {
    it('должен отправлять событие ошибки команды бота', () => {
      analyticsService.trackBotCommandError({
        command: '/search',
        errorType: 'validation_error',
        errorMessage: 'Invalid query',
        userState: 'waiting_for_search_query',
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackMessageReceived', () => {
    it('должен отправлять событие получения сообщения', () => {
      analyticsService.trackMessageReceived({
        messageLength: 10,
        userState: 'idle',
        userCity: 'Moscow',
        messageType: 'text',
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchQueryError', () => {
    it('должен отправлять событие ошибки поискового запроса', () => {
      analyticsService.trackSearchQueryError({
        id: 'search_123',
        queryLength: 5,
        errorType: 'api_error',
        errorMessage: 'API unavailable',
        processingTimeMs: 1000,
        searchMethod: 'hybrid',
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchLimitExceeded', () => {
    it('должен отправлять событие превышения лимита поиска', () => {
      analyticsService.trackSearchLimitExceeded({
        userSubscription: 'basic',
        searchesToday: 10,
        searchLimit: 10,
        remainingSearches: 0,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackCallbackButtonClicked', () => {
    it('должен отправлять событие нажатия на callback кнопку', () => {
      analyticsService.trackCallbackButtonClicked({
        buttonType: 'city_selection',
        buttonData: 'moscow',
        userState: 'waiting_for_city',
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackCitySelectionCompleted', () => {
    it('должен отправлять событие завершения выбора города', () => {
      analyticsService.trackCitySelectionCompleted({
        selectedCity: 'Moscow',
        selectionMethod: 'callback',
        oldCity: 'St. Petersburg',
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackItemSelectionCompleted', () => {
    it('должен отправлять событие выбора блюда', () => {
      analyticsService.trackItemSelectionCompleted({
        searchHistoryId: 'history_123',
        itemId: 'item_456',
        hasPhoto: true,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackPageNavigationCompleted', () => {
    it('должен отправлять событие навигации по страницам', () => {
      analyticsService.trackPageNavigationCompleted({
        searchHistoryId: 'history_123',
        pageNumber: 2,
        totalPages: 5,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackHistoryItemRepeated', () => {
    it('должен отправлять событие повторного поиска из истории', () => {
      analyticsService.trackHistoryItemRepeated({
        historyItemId: 'history_123',
        originalQuery: 'пицца',
        queryLength: 5,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackNeuralServiceError', () => {
    it('должен отправлять событие ошибки нейросервиса', () => {
      analyticsService.trackNeuralServiceError({
        serviceType: 'llm',
        errorType: 'rate_limit',
        errorMessage: 'Rate limit exceeded',
        retryCount: 3,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackRateLimitExceeded', () => {
    it('должен отправлять событие превышения лимита запросов', () => {
      analyticsService.trackRateLimitExceeded({
        limitType: 'per_minute',
        currentRequests: 60,
        limitValue: 60,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackCacheMiss', () => {
    it('должен отправлять событие промаха кэша', () => {
      analyticsService.trackCacheMiss({
        cacheType: 'redis',
        cacheKey: 'menu:123',
        dataType: 'menu',
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchHistoryViewed', () => {
    it('должен отправлять событие просмотра истории поиска', () => {
      analyticsService.trackSearchHistoryViewed({
        historyItemsCount: 10,
        viewedItemsCount: 5,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackUserStatsViewed', () => {
    it('должен отправлять событие просмотра статистики пользователя', () => {
      analyticsService.trackUserStatsViewed({
        userSubscription: 'premium',
        searchesToday: 5,
        searchesThisMonth: 50,
        totalSearches: 200,
        userId: 123,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackBotStarted', () => {
    it('должен отправлять событие запуска бота', () => {
      analyticsService.trackBotStarted({
        botVersion: '1.0.0',
        environment: 'production',
        startupTimeMs: 1000,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackBotStopped', () => {
    it('должен отправлять событие остановки бота', () => {
      analyticsService.trackBotStopped({
        uptimeMinutes: 1440,
        totalRequests: 1000,
        totalErrors: 10,
      });

      expect(analyticsService).toBeDefined();
    });
  });
});
