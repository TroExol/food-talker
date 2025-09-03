import { ConsoleLogger } from '@/utils/ConsoleLogger';

import type {
  AnalyticsEvent,
  TAnalyticsConfig,
  TTrackBotCommandErrorParams,
  TTrackBotCommandParams,
  TTrackCallbackButtonClickedParams,
  TTrackCitySelectionCompletedParams,
  TTrackErrorParams,
  TTrackHistoryItemRepeatedParams,
  TTrackItemSelectionCompletedParams,
  TTrackMessageReceivedParams,
  TTrackNeuralSummaryParams,
  TTrackPageNavigationCompletedParams,
  TTrackPerformanceParams,
  TTrackSearchHistoryViewedParams,
  TTrackSearchLimitExceededParams,
  TTrackSearchQueryCompletedParams,
  TTrackSearchQueryStartedParams,
  TTrackUserStateChangedParams,
  TTrackUserStatsViewedParams,
} from './types';
import type { TelemetreeService } from '../TelemetreeService/TelemetreeService';

export class AnalyticsService {
  constructor(
    private readonly telemetree: TelemetreeService,
    private readonly config: TAnalyticsConfig,
  ) { }

  public trackEvent(event: AnalyticsEvent): void {
    if (!this.config.enabled) return;

    try {
      if (event.update) {
        // Отправляем как Telegram обновление
        this.telemetree.trackUpdate(event.update, event.name, event.parameters);
      } else if (event.user) {
        // Отправляем как пользовательское событие
        this.telemetree.trackCustomEvent(event.name, event.user, event.parameters);
      } else {
        ConsoleLogger.warn('Событие не содержит ни user, ни update. Пропускаем отправку.', { event: event.name });
        return;
      }

      ConsoleLogger.info('Событие отправлено в аналитику', { event: event.name });
    } catch (error) {
      ConsoleLogger.error('Ошибка при отправке события в аналитику', error as Error, { event });
    }
  }

  public trackError = (params: TTrackErrorParams): void => {
    this.trackEvent({
      name: 'error_occurred',
      parameters: {
        error_type: params.error.name,
        error_message: params.error.message,
        stack_trace: params.error.stack,
        component: params.context.component || 'unknown',
        user_action: params.context.user_action || 'unknown',
        ...params.context,
      },
      timestamp: Math.floor(Date.now() / 1000),
      user: params.user,
    });
  };

  public trackPerformance = (params: TTrackPerformanceParams): void => {
    this.trackEvent({
      name: 'performance_metric',
      parameters: {
        operation: params.operation,
        duration_ms: params.duration,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackNeuralSummary = (params: TTrackNeuralSummaryParams): void => {
    this.trackEvent({
      name: `${params.serviceType}_requests_summary`,
      parameters: {
        period_minutes: params.summary.period_minutes,
        total_requests: params.summary.total_requests,
        successful_requests: params.summary.successful_requests,
        failed_requests: params.summary.failed_requests,
        average_response_time_ms: params.summary.average_response_time_ms,
        total_tokens_used: params.summary.total_tokens_used,
        total_vectors_processed: params.summary.total_vectors_processed,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public flush = async (): Promise<void> => {
    if (!this.config.enabled) return;

    try {
      await this.telemetree.flush();
    } catch (error) {
      ConsoleLogger.error('Ошибка при отправке событий в аналитику', error as Error);
    }
  };

  public gracefulShutdown = async (): Promise<void> => {
    ConsoleLogger.info('Завершение работы AnalyticsService...');

    try {
      await this.flush();
      await this.telemetree.destroy();
      ConsoleLogger.info('AnalyticsService завершен');
    } catch (error) {
      ConsoleLogger.error('Ошибка при завершении работы AnalyticsService:', error as Error);
    }
  };

  // Методы для конкретных событий
  public trackBotCommand = (params: TTrackBotCommandParams): void => {
    this.trackEvent({
      name: 'bot_command_executed',
      parameters: {
        command: params.command,
        user_state: params.userState,
        user_city: params.userCity,
      },
      timestamp: Math.floor(Date.now() / 1000),
      user: params.user,
      update: params.update, // Используем update если есть
    });
  };

  public trackSearchQueryStarted = (params: TTrackSearchQueryStartedParams): void => {
    this.trackEvent({
      name: 'search_query_started',
      parameters: {
        id: params.id,
        query: params.query,
        query_length: params.query.length,
        user_city: params.userCity,
        search_options: JSON.stringify(params.searchOptions),
      },
      timestamp: Math.floor(Date.now() / 1000),
      user: params.user,
    });
  };

  public trackSearchQueryCompleted = (params: TTrackSearchQueryCompletedParams): void => {
    this.trackEvent({
      name: 'search_query_completed',
      parameters: {
        id: params.id,
        query_length: params.queryLength,
        results_count: params.resultsCount,
        processing_time_ms: params.processingTimeMs,
        search_method: params.searchMethod,
        has_llm_enhancement: params.hasLlmEnhancement,
        has_vector_search: params.hasVectorSearch,
      },
      timestamp: Math.floor(Date.now() / 1000),
      user: params.user,
    });
  };

  public trackUserStateChanged = (params: TTrackUserStateChangedParams): void => {
    this.trackEvent({
      name: 'user_state_changed',
      parameters: {
        old_state: params.oldState,
        new_state: params.newState,
        trigger: params.trigger,
      },
      timestamp: Math.floor(Date.now() / 1000),
      user: params.user,
    });
  };

  // Новые методы для недостающих событий
  public trackBotCommandError = (params: TTrackBotCommandErrorParams): void => {
    this.trackEvent({
      name: 'bot_command_error',
      parameters: {
        command: params.command,
        error_type: params.errorType,
        error_message: params.errorMessage,
        user_state: params.userState,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackMessageReceived = (params: TTrackMessageReceivedParams): void => {
    this.trackEvent({
      name: 'message_received',
      parameters: {
        message_length: params.messageLength,
        user_state: params.userState,
        user_city: params.userCity,
        message_type: params.messageType,
      },
      timestamp: Math.floor(Date.now() / 1000),
      user: params.user,
      update: params.update, // Используем trackUpdate для сообщений
    });
  };

  public trackSearchLimitExceeded = (params: TTrackSearchLimitExceededParams): void => {
    this.trackEvent({
      name: 'search_limit_exceeded',
      parameters: {
        user_subscription: params.userSubscription,
        searches_today: params.searchesToday,
        search_limit: params.searchLimit,
        remaining_searches: params.remainingSearches,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackCallbackButtonClicked = (params: TTrackCallbackButtonClickedParams): void => {
    this.trackEvent({
      name: 'callback_button_clicked',
      parameters: {
        button_type: params.buttonType,
        button_data: params.buttonData,
        user_state: params.userState,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackCitySelectionCompleted = (params: TTrackCitySelectionCompletedParams): void => {
    this.trackEvent({
      name: 'city_selection_completed',
      parameters: {
        selected_city: params.selectedCity,
        selection_method: params.selectionMethod,
        old_city: params.oldCity,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackItemSelectionCompleted = (params: TTrackItemSelectionCompletedParams): void => {
    this.trackEvent({
      name: 'item_selection_completed',
      parameters: {
        search_history_id: params.searchHistoryId,
        item_index: params.itemIndex,
        has_photo: params.hasPhoto,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackPageNavigationCompleted = (params: TTrackPageNavigationCompletedParams): void => {
    this.trackEvent({
      name: 'page_navigation_completed',
      parameters: {
        search_history_id: params.searchHistoryId,
        page_number: params.pageNumber,
        total_pages: params.totalPages,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackHistoryItemRepeated = (params: TTrackHistoryItemRepeatedParams): void => {
    this.trackEvent({
      name: 'history_item_repeated',
      parameters: {
        history_item_id: params.historyItemId,
        original_query: params.originalQuery,
        query_length: params.queryLength,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackSearchHistoryViewed = (params: TTrackSearchHistoryViewedParams): void => {
    this.trackEvent({
      name: 'search_history_viewed',
      parameters: {
        history_items_count: params.historyItemsCount,
        viewed_items_count: params.viewedItemsCount,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };

  public trackUserStatsViewed = (params: TTrackUserStatsViewedParams): void => {
    this.trackEvent({
      name: 'user_stats_viewed',
      parameters: {
        user_subscription: params.userSubscription,
        searches_today: params.searchesToday,
        searches_this_month: params.searchesThisMonth,
        total_searches: params.totalSearches,
      },
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды для Measurement Protocol
      user: params.user,
    });
  };
}
