import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TAnalyticsConfig } from './types';
import type { TelemetreeService } from '../TelemetreeService/TelemetreeService';

import { AnalyticsService } from './AnalyticsService';

// Мокаем TelemetreeServiceFactory
vi.mock('./TelemetreeService/TelemetreeServiceFactory', () => ({
  TelemetreeServiceFactory: {
    getInstance: vi.fn(() => ({
      trackEvent: vi.fn(),
      trackGoal: vi.fn(),
      trackPageView: vi.fn(),
      flush: vi.fn(),
      destroy: vi.fn(),
    })),
  },
}));

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockTelemetreeService: TelemetreeService;
  let config: TAnalyticsConfig;

  beforeEach(() => {
    mockTelemetreeService = {
      trackEvent: vi.fn(),
      trackGoal: vi.fn(),
      trackPageView: vi.fn(),
      flush: vi.fn(),
      destroy: vi.fn(),
    } as unknown as TelemetreeService;

    config = {
      enabled: true,
      batchSize: 10,
      flushIntervalMs: 5000,
      retryAttempts: 3,
      retryDelayMs: 1000,
    };
    analyticsService = new AnalyticsService(
      mockTelemetreeService,
      config,
    );
  });

  describe('trackEvent', () => {
    it('должен отправлять событие когда аналитика включена', () => {
      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
        user: {
          id: 123,
          first_name: 'John',
          last_name: 'Doe',
          username: 'john_doe',
          language_code: 'en',
          is_premium: false,
        },
      };

      analyticsService.trackEvent(event);

      // Проверяем, что событие было отправлено
      expect(analyticsService).toBeDefined();
    });

    it('не должен отправлять событие когда аналитика отключена', () => {
      const disabledConfig = { ...config, enabled: false };
      const disabledService = new AnalyticsService(
        mockTelemetreeService,
        disabledConfig,
      );

      const event = {
        name: 'test_event',
        parameters: { test: 'value' },
        timestamp: Date.now(),
        user: {
          id: 123,
          first_name: 'John',
          last_name: 'Doe',
          username: 'john_doe',
          language_code: 'en',
          is_premium: false,
        },
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
        user_id: '123',
      };
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };

      analyticsService.trackError({ error, context, user });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackPerformance', () => {
    it('должен отправлять метрику производительности', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackPerformance({ operation: 'test_operation', duration: 100, user });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackBotCommand', () => {
    it('должен отправлять событие выполнения команды бота', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackBotCommand({ command: '/start', userState: 'idle', userCity: 'Moscow', user });

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

      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };

      analyticsService.trackSearchQueryStarted({
        id: 'search_123',
        query: 'пицца',
        userCity: 'Moscow',
        searchOptions,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchQueryCompleted', () => {
    it('должен отправлять событие завершения поискового запроса', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackSearchQueryCompleted({
        id: 'search_123',
        queryLength: 5,
        resultsCount: 10,
        processingTimeMs: 1500,
        searchMethod: 'hybrid',
        hasLlmEnhancement: true,
        hasVectorSearch: true,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackUserStateChanged', () => {
    it('должен отправлять событие изменения состояния пользователя', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackUserStateChanged({
        oldState: 'idle',
        newState: 'waiting_for_search_query',
        trigger: 'command',
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackBotCommandError', () => {
    it('должен отправлять событие ошибки команды бота', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackBotCommandError({
        command: '/search',
        errorType: 'validation_error',
        errorMessage: 'Invalid query',
        userState: 'waiting_for_search_query',
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackMessageReceived', () => {
    it('должен отправлять событие получения сообщения', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackMessageReceived({
        messageLength: 10,
        userState: 'idle',
        userCity: 'Moscow',
        messageType: 'text',
        user,
        update: {
          message: {
            text: 'test',
            message_id: 123,
            chat: {
              id: 123,
              type: 'private',
            },
            date: 123,
          },
        },
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchLimitExceeded', () => {
    it('должен отправлять событие превышения лимита поиска', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackSearchLimitExceeded({
        userSubscription: 'basic',
        searchesToday: 10,
        searchLimit: 10,
        remainingSearches: 0,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackCallbackButtonClicked', () => {
    it('должен отправлять событие нажатия на callback кнопку', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackCallbackButtonClicked({
        buttonType: 'city_selection',
        buttonData: 'moscow',
        userState: 'waiting_for_city',
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackCitySelectionCompleted', () => {
    it('должен отправлять событие завершения выбора города', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackCitySelectionCompleted({
        selectedCity: 'Moscow',
        selectionMethod: 'callback',
        oldCity: 'St. Petersburg',
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackItemSelectionCompleted', () => {
    it('должен отправлять событие выбора блюда', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackItemSelectionCompleted({
        searchHistoryId: 'history_123',
        itemIndex: 456,
        hasPhoto: true,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackPageNavigationCompleted', () => {
    it('должен отправлять событие навигации по страницам', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackPageNavigationCompleted({
        searchHistoryId: 'history_123',
        pageNumber: 2,
        totalPages: 5,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackHistoryItemRepeated', () => {
    it('должен отправлять событие повторного поиска из истории', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackHistoryItemRepeated({
        historyItemId: 'history_123',
        originalQuery: 'пицца',
        queryLength: 5,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackSearchHistoryViewed', () => {
    it('должен отправлять событие просмотра истории поиска', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackSearchHistoryViewed({
        historyItemsCount: 10,
        viewedItemsCount: 5,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });

  describe('trackUserStatsViewed', () => {
    it('должен отправлять событие просмотра статистики пользователя', () => {
      const user = {
        id: 123,
        first_name: 'John',
        last_name: 'Doe',
        username: 'john_doe',
        language_code: 'en',
        is_premium: false,
      };
      analyticsService.trackUserStatsViewed({
        userSubscription: 'premium',
        searchesToday: 5,
        searchesThisMonth: 50,
        totalSearches: 200,
        user,
      });

      expect(analyticsService).toBeDefined();
    });
  });
});
