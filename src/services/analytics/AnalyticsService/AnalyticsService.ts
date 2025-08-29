import { ConsoleLogger } from '@/utils/ConsoleLogger';

import type {
  AnalyticsEvent,
  TAnalyticsConfig,
  TTrackBotCommandParams,
  TTrackErrorParams,
  TTrackNeuralSummaryParams,
  TTrackPerformanceParams,
  TTrackSearchQueryCompletedParams,
  TTrackSearchQueryStartedParams,
  TTrackUserStateChangedParams,
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

  public trackError(params: TTrackErrorParams): void {
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
  }

  public trackPerformance(params: TTrackPerformanceParams): void {
    this.trackEvent({
      name: 'performance_metric',
      parameters: {
        operation: params.operation,
        duration_ms: params.duration,
      },
      timestamp: Date.now(),
    });
  }

  public trackNeuralSummary(params: TTrackNeuralSummaryParams): void {
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
  }

  public async flush(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await this.yandexMetrica.flush();
    } catch (error) {
      ConsoleLogger.error('Ошибка при отправке событий в аналитику', error as Error);
    }
  }

  public async gracefulShutdown(): Promise<void> {
    ConsoleLogger.info('Завершение работы AnalyticsService...');

    try {
      await this.flush();
      this.yandexMetrica.destroy();
      await this.yandexMetrica.flush();
      ConsoleLogger.info('AnalyticsService завершен');
    } catch (error) {
      ConsoleLogger.error('Ошибка при завершении работы AnalyticsService:', error as Error);
    }
  }

  // Методы для конкретных событий
  public trackBotCommand(params: TTrackBotCommandParams): void {
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
  }

  public trackSearchQueryStarted(params: TTrackSearchQueryStartedParams): void {
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
  }

  public trackSearchQueryCompleted(params: TTrackSearchQueryCompletedParams): void {
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
  }

  public trackUserStateChanged(params: TTrackUserStateChangedParams): void {
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
  }
}
