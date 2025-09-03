import type { TelegramUpdate, TelegramUser } from '@tonsolutions/telemetree-node';

import { TelemetreeClient } from '@tonsolutions/telemetree-node';

import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type {
  TelemetreeBatch,
  TelemetreeConfig,
  TelemetreeCustomEvent,
  TelemetreeUpdateEvent,
} from './types';

export class TelemetreeService {
  private readonly config: TelemetreeConfig;
  private readonly client: TelemetreeClient;
  private readonly customEventQueue: TelemetreeCustomEvent[] = [];
  private readonly updateEventQueue: TelemetreeUpdateEvent[] = [];
  private readonly flushInterval?: NodeJS.Timeout;
  private isFlushing = false;
  private isInitialized = false;

  constructor(config: TelemetreeConfig) {
    this.config = config;
    this.client = new TelemetreeClient(config.projectId, config.apiKey, {
      logging: {
        silent: true,
      },
    });

    // Инициализируем клиент при создании сервиса
    this.initialize().catch(error => {
      ConsoleLogger.error('Ошибка при инициализации Telemetree клиента', error as Error);
    });

    // Настраиваем автоматическую отправку событий
    this.flushInterval = setInterval(() => {
      this.flush().catch(error => {
        ConsoleLogger.error('Ошибка при автоматической отправке событий в Telemetree', error as Error);
      });
    }, this.config.flushIntervalMs);
  }

  private initialize = async (): Promise<void> => {
    if (this.isInitialized) return;

    try {
      await this.client.initialize();
      this.isInitialized = true;
      ConsoleLogger.info('Telemetree клиент успешно инициализирован');
    } catch (error) {
      ConsoleLogger.error('Не удалось инициализировать Telemetree клиент', error as Error);
      throw error;
    }
  };

  // Отслеживание пользовательских событий с Telegram пользователем
  public trackCustomEvent = (eventName: string, user: TelegramUser, properties?: Record<string, unknown>): void => {
    this.customEventQueue.push({
      eventName,
      user,
      properties,
    });

    this.checkAndFlush();
  };

  // Отслеживание Telegram обновлений (сообщения, команды и т.д.)
  public trackUpdate = (
    update: TelegramUpdate,
    eventType?: string,
    properties?: Record<string, unknown>,
  ): void => {
    this.updateEventQueue.push({
      update,
      eventType,
      properties,
    });

    this.checkAndFlush();
  };

  private checkAndFlush = (): void => {
    const totalEvents = this.customEventQueue.length + this.updateEventQueue.length;
    if (totalEvents >= this.config.batchSize) {
      this.flush().catch(error => {
        ConsoleLogger.error('Ошибка при отправке событий в Telemetree', error as Error);
      });
    }
  };

  public flush = async (): Promise<void> => {
    const totalEvents = this.customEventQueue.length + this.updateEventQueue.length;
    if (this.isFlushing || totalEvents === 0) return;

    // Ждем инициализации клиента, если она еще не завершена
    if (!this.isInitialized) {
      try {
        await this.initialize();
      } catch (error) {
        ConsoleLogger.error('Не удалось инициализировать Telemetree перед отправкой событий', error as Error);
        return;
      }
    }

    this.isFlushing = true;
    const customEventsToSend = [...this.customEventQueue];
    const updateEventsToSend = [...this.updateEventQueue];

    this.customEventQueue.length = 0;
    this.updateEventQueue.length = 0;

    try {
      await this.sendEvents(customEventsToSend, updateEventsToSend);
      ConsoleLogger.info(
        `Отправлено ${totalEvents} событий в Telemetree (${customEventsToSend.length} пользовательских, ${updateEventsToSend.length} обновлений)`,
      );
    } catch (error) {
      // Возвращаем события в очередь при ошибке
      this.customEventQueue.unshift(...customEventsToSend);
      this.updateEventQueue.unshift(...updateEventsToSend);
      throw error;
    } finally {
      this.isFlushing = false;
    }
  };

  private sendEvents = async (
    customEvents: TelemetreeCustomEvent[],
    updateEvents: TelemetreeUpdateEvent[],
  ): Promise<void> => {
    const batch: TelemetreeBatch = {
      customEvents,
      updateEvents,
      timestamp: Math.floor(Date.now() / 1000),
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

  private sendBatch = async (batch: TelemetreeBatch): Promise<void> => {
    try {
      // Отправляем пользовательские события
      for (const event of batch.customEvents) {
        await this.client.track(event.user, event.eventName, event.properties);
      }

      // Отправляем события обновлений
      for (const event of batch.updateEvents) {
        await this.client.trackUpdate(event.update);
      }
    } catch (error) {
      const totalEvents = batch.customEvents.length + batch.updateEvents.length;
      throw AppError.apiError(`Ошибка при отправке событий в Telemetree: ${(error as Error).message}`, {
        originalError: error,
        batchSize: totalEvents,
      });
    }
  };

  public destroy = async (): Promise<void> => {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Отправляем оставшиеся события перед завершением
    try {
      await this.flush();
    } catch (error) {
      ConsoleLogger.error('Ошибка при финальной отправке событий в Telemetree', error as Error);
    }
  };

  /**
   * Генерирует Client ID для пользователя (совместимость с YandexMetricaService)
   */
  public generateClientId = (userId: string): string => {
    const hash = this.generateDeterministicHash(userId);
    return String(Math.abs(hash) % 9000000000000000000 + 1000000000000000000);
  };

  /**
   * Генерирует детерминированный хэш из строки
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
}
