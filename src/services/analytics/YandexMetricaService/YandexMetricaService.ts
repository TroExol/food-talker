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
    this.eventQueue.push({
      ...event,
      timestamp: event.timestamp || Math.floor(Date.now() / 1000), // Конвертируем в секунды
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
      timestamp: Math.floor(Date.now() / 1000), // Конвертируем в секунды
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

      // Client ID - обязательный параметр для Measurement Protocol
      if (event.session_id) {
        eventUrl.searchParams.set('cid', event.session_id);
      } else {
        // Генерируем уникальный числовой Client ID если session_id отсутствует
        // Используем user_id или генерируем числовой идентификатор
        let clientId: string;
        if (event.user_id) {
          // Если есть user_id, создаем детерминированный числовой хэш из него
          // Это гарантирует, что один и тот же user_id всегда дает одинаковый Client ID
          clientId = this.generateClientId(event.user_id);
        } else {
          // Генерируем случайный числовой Client ID в формате, подобном примерам Яндекс Метрики
          clientId = this.generateClientId('');
        }
        eventUrl.searchParams.set('cid', clientId);
      }

      // Добавляем параметры события
      if (event.name === 'goal') {
        eventUrl.searchParams.set('t', 'event');
        eventUrl.searchParams.set('ea', event.parameters.goal_name as string);
      } else if (event.name === 'pageview') {
        eventUrl.searchParams.set('t', 'pageview');
        eventUrl.searchParams.set('dl', event.parameters.url as string);
        if (event.parameters.title) {
          eventUrl.searchParams.set('dt', event.parameters.title as string);
        }
      } else {
        // Для остальных событий используем тип 'event' и имя события как action
        eventUrl.searchParams.set('t', 'event');
        eventUrl.searchParams.set('ea', event.name);
      }

      // Добавляем дополнительные параметры события
      Object.entries(event.parameters).forEach(([key, value]) => {
        if (key !== 'goal_name' && key !== 'url' && key !== 'title') {
          // Для Measurement Protocol используем префикс ep. для кастомных параметров
          const paramKey = key.startsWith('ep.') ? key : `ep.${key}`;
          eventUrl.searchParams.set(paramKey, String(value));
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

  /**
   * Генерирует детерминированный хэш из строки
   * Гарантирует одинаковый результат для одинаковых входных данных
   */
  private generateDeterministicHash = (input: string): number => {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Преобразуем в 32-битное число
    }
    return hash;
  };

  /**
   * Генерирует Client ID для пользователя
   * Для одного user_id всегда возвращает одинаковый Client ID
   */
  public generateClientId = (userId: string): string => {
    const hash = this.generateDeterministicHash(userId);
    return String(Math.abs(hash) % 9000000000000000000 + 1000000000000000000);
  };
}
