import { ConsoleLogger } from '@/utils/ConsoleLogger';

export class AsyncRequestManager {
  private readonly maxConcurrentRequests: number;
  private activeRequests = 0;

  constructor(maxConcurrentRequests = 5) {
    this.maxConcurrentRequests = maxConcurrentRequests;
  }

  public async executeRequest<T>(
    id: string,
    requestFn: () => Promise<T>,
  ): Promise<T> {
    // Простая проверка лимита
    if (this.activeRequests >= this.maxConcurrentRequests) {
      ConsoleLogger.debug('Достигнут лимит запросов, ожидаем', {
        id,
        activeRequests: this.activeRequests,
        maxConcurrentRequests: this.maxConcurrentRequests,
      });

      // Ждем освобождения слота
      while (this.activeRequests >= this.maxConcurrentRequests) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    this.activeRequests++;
    ConsoleLogger.debug('Начинаем выполнение запроса', {
      id,
      activeRequests: this.activeRequests,
    });

    try {
      const result = await requestFn();
      return result;
    } catch (error) {
      ConsoleLogger.error('Ошибка выполнения запроса', error as Error, { id });
      throw error;
    } finally {
      this.activeRequests--;
      ConsoleLogger.debug('Завершили выполнение запроса', {
        id,
        activeRequests: this.activeRequests,
      });
    }
  }

  public getStats() {
    return {
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
    };
  }
}
