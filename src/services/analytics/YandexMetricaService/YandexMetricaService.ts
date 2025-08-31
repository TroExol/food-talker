import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type {
  YandexMetricaBatch,
  YandexMetricaConfig,
  YandexMetricaEvent,
} from './types';

export class YandexMetricaService {
  private readonly config: YandexMetricaConfig;
  private readonly eventQueue: YandexMetricaEvent[] = [];
  private readonly flushInterval?: NodeJS.Timeout;
  private isFlushing = false;

  constructor(config: YandexMetricaConfig) {
    this.config = config;

    this.flushInterval = setInterval(() => {
      this.flush().catch(error => {
        ConsoleLogger.error('Ошибка при автоматической отправке событий в Яндекс Метрику', error as Error);
      });
    }, 5000); // Отправляем каждые 5 секунд
  }

  public trackEvent = (event: YandexMetricaEvent): void => {
    // Добавляем дату в формате YYYY-MM-DD если её нет
    const dt = event.dt || new Date(event.timestamp || Date.now()).toISOString().split('T')[0];

    this.eventQueue.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
      dt,
    });

    if (this.eventQueue.length >= 10) {
      this.flush().catch(error => {
        ConsoleLogger.error('Ошибка при отправке событий в Яндекс Метрику', error as Error);
      });
    }
  };

  public trackGoal = (goalName: string, parameters?: Record<string, unknown>): void => {
    this.trackEvent({
      name: 'goal',
      parameters: {
        goal_name: goalName,
        ...parameters,
      },
      timestamp: Date.now(),
    });
  };

  public trackPageView = (url: string, title?: string, parameters?: Record<string, unknown>): void => {
    this.trackEvent({
      name: 'pageview',
      parameters: {
        url,
        title,
        ...parameters,
      },
      timestamp: Date.now(),
    });
  };

  public flush = async (): Promise<void> => {
    if (this.isFlushing || this.eventQueue.length === 0) return;

    this.isFlushing = true;
    const eventsToSend = [...this.eventQueue];
    this.eventQueue.length = 0;

    try {
      await this.sendEvents(eventsToSend);
      ConsoleLogger.info(`Отправлено ${eventsToSend.length} событий в Яндекс Метрику`);
    } catch (error) {
      // Возвращаем события в очередь при ошибке
      this.eventQueue.unshift(...eventsToSend);
      throw error;
    } finally {
      this.isFlushing = false;
    }
  };

  private sendEvents = async (events: YandexMetricaEvent[]): Promise<void> => {
    const batch: YandexMetricaBatch = {
      events,
      timestamp: Date.now(),
    };

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        await this.sendBatch(batch);
        return;
      } catch (error) {
        if (attempt >= this.config.retryAttempts) {
          throw error;
        }

        await sleep(this.config.retryDelayMs * (attempt + 1));
      }
    }
  };

  private sendBatch = async (batch: YandexMetricaBatch): Promise<void> => {
    const url = new URL(this.config.endpoint);

    // Добавляем обязательные параметры
    url.searchParams.set('tid', this.config.counterId);
    url.searchParams.set('t', 'event');
    url.searchParams.set('et', batch.timestamp.toString());
    url.searchParams.set('ms', this.config.measurementProtocolToken);

    // Отправляем каждое событие отдельно (Measurement Protocol)
    for (const event of batch.events) {
      const eventUrl = new URL(url.toString());

      if (event.user_id) {
        eventUrl.searchParams.set('uid', event.user_id.toString());
      }

      if (event.session_id) {
        eventUrl.searchParams.set('сid', event.session_id);
      } else {
        eventUrl.searchParams.set('cid', `${batch.timestamp}${(Math.random() * 100).toFixed(0)}`);
      }

      // Добавляем дату в формате YYYY-MM-DD
      if (event.dt) {
        eventUrl.searchParams.set('dt', event.dt);
      }

      // Добавляем параметры события
      if (event.name === 'goal') {
        eventUrl.searchParams.set('ea', event.parameters.goal_name as string);
      } else if (event.name === 'pageview') {
        eventUrl.searchParams.set('dl', event.parameters.url as string);
        if (event.parameters.title) {
          eventUrl.searchParams.set('dt_title', event.parameters.title as string);
        }
      }

      // Добавляем дополнительные параметры
      Object.entries(event.parameters).forEach(([key, value]) => {
        if (key !== 'goal_name' && key !== 'url' && key !== 'title') {
          eventUrl.searchParams.set(`ep.${key}`, String(value));
        }
      });

      const response = await fetch(eventUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        throw AppError.apiError(`HTTP ${response.status}: ${response.statusText}`, {
          response,
        });
      }
    }
  };

  public destroy = (): void => {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  };
}
