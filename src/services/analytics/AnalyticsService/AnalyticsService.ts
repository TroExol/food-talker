import { ConsoleLogger } from '@/utils/ConsoleLogger';

import type {
  AnalyticsEvent,
  TAnalyticsConfig,
  TTrackBotCommandErrorParams,
  TTrackBotCommandParams,
  TTrackBotStartedParams,
  TTrackBotStoppedParams,
  TTrackCacheMissParams,
  TTrackCallbackButtonClickedParams,
  TTrackCitySelectionCompletedParams,
  TTrackErrorParams,
  TTrackHistoryItemRepeatedParams,
  TTrackItemSelectionCompletedParams,
  TTrackMessageReceivedParams,
  TTrackNeuralServiceErrorParams,
  TTrackNeuralSummaryParams,
  TTrackPageNavigationCompletedParams,
  TTrackPerformanceParams,
  TTrackRateLimitExceededParams,
  TTrackSearchHistoryViewedParams,
  TTrackSearchLimitExceededParams,
  TTrackSearchQueryCompletedParams,
  TTrackSearchQueryErrorParams,
  TTrackSearchQueryStartedParams,
  TTrackUserStateChangedParams,
  TTrackUserStatsViewedParams,
} from './types';
import type { YandexMetricaService } from '../YandexMetricaService/YandexMetricaService';

export class AnalyticsService {
  constructor(
    private readonly yandexMetrica: YandexMetricaService,
    private readonly config: TAnalyticsConfig,
  ) { }

  public trackEvent(event: AnalyticsEvent): void {
    if (!this.config.enabled) return;

    try {
      // Добавляем дату в формате YYYY-MM-DD
      const dt = new Date(event.timestamp).toISOString().split('T')[0];

      // Отправляем событие в Яндекс Метрику
      this.yandexMetrica.trackEvent({
        name: event.name,
        parameters: event.parameters,
        timestamp: event.timestamp,
        user_id: event.user_id,
        session_id: event.session_id,
        dt,
      });

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
      timestamp: Date.now(),
      user_id: params.context.user_id as number,
      session_id: params.context.session_id as string,
    });
  };

  public trackPerformance = (params: TTrackPerformanceParams): void => {
    this.trackEvent({
      name: 'performance_metric',
      parameters: {
        operation: params.operation,
        duration_ms: params.duration,
      },
      timestamp: Date.now(),
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
      timestamp: Date.now(),
    });
  };

  public flush = async (): Promise<void> => {
    if (!this.config.enabled) return;

    try {
      await this.yandexMetrica.flush();
    } catch (error) {
      ConsoleLogger.error('Ошибка при отправке событий в аналитику', error as Error);
    }
  };

  public gracefulShutdown = async (): Promise<void> => {
    ConsoleLogger.info('Завершение работы AnalyticsService...');

    try {
      await this.flush();
      this.yandexMetrica.destroy();
      await this.yandexMetrica.flush();
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
    });
  };

  public trackSearchQueryError = (params: TTrackSearchQueryErrorParams): void => {
    this.trackEvent({
      name: 'search_query_error',
      parameters: {
        id: params.id,
        query_length: params.queryLength,
        error_type: params.errorType,
        error_message: params.errorMessage,
        processing_time_ms: params.processingTimeMs,
        search_method: params.searchMethod,
      },
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
    });
  };

  public trackItemSelectionCompleted = (params: TTrackItemSelectionCompletedParams): void => {
    this.trackEvent({
      name: 'item_selection_completed',
      parameters: {
        search_history_id: params.searchHistoryId,
        item_id: params.itemId,
        has_photo: params.hasPhoto,
      },
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
    });
  };

  public trackNeuralServiceError = (params: TTrackNeuralServiceErrorParams): void => {
    this.trackEvent({
      name: 'neural_service_error',
      parameters: {
        service_type: params.serviceType,
        error_type: params.errorType,
        error_message: params.errorMessage,
        retry_count: params.retryCount,
      },
      timestamp: Date.now(),
    });
  };

  public trackRateLimitExceeded = (params: TTrackRateLimitExceededParams): void => {
    this.trackEvent({
      name: 'rate_limit_exceeded',
      parameters: {
        limit_type: params.limitType,
        current_requests: params.currentRequests,
        limit_value: params.limitValue,
      },
      timestamp: Date.now(),
      user_id: params.userId,
    });
  };

  public trackCacheMiss = (params: TTrackCacheMissParams): void => {
    this.trackEvent({
      name: 'cache_miss',
      parameters: {
        cache_type: params.cacheType,
        cache_key: params.cacheKey,
        data_type: params.dataType,
      },
      timestamp: Date.now(),
    });
  };

  public trackSearchHistoryViewed = (params: TTrackSearchHistoryViewedParams): void => {
    this.trackEvent({
      name: 'search_history_viewed',
      parameters: {
        history_items_count: params.historyItemsCount,
        viewed_items_count: params.viewedItemsCount,
      },
      timestamp: Date.now(),
      user_id: params.userId,
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
      timestamp: Date.now(),
      user_id: params.userId,
    });
  };

  public trackBotStarted = (params: TTrackBotStartedParams): void => {
    this.trackEvent({
      name: 'bot_started',
      parameters: {
        bot_version: params.botVersion,
        environment: params.environment,
        startup_time_ms: params.startupTimeMs,
      },
      timestamp: Date.now(),
    });
  };

  public trackBotStopped = (params: TTrackBotStoppedParams): void => {
    this.trackEvent({
      name: 'bot_stopped',
      parameters: {
        uptime_minutes: params.uptimeMinutes,
        total_requests: params.totalRequests,
        total_errors: params.totalErrors,
      },
      timestamp: Date.now(),
    });
  };
}
