import type { TBotContext, TRateLimitConfig } from '@/types/telegram';

export class RateLimitMiddleware {
  private readonly userLimits = new Map<string, { requests: number[]; lastReset: number }>();

  constructor(
    private readonly config: TRateLimitConfig,
  ) {}

  public checkRateLimit = async (ctx: TBotContext, next: () => Promise<void>): Promise<void> => {
    const telegramId = ctx.from?.id.toString();

    if (!telegramId) {
      await next();
      return;
    }

    const now = Date.now();
    const userLimit = this.userLimits.get(telegramId);

    if (!userLimit) {
      // Первый запрос пользователя
      this.userLimits.set(telegramId, {
        requests: [now],
        lastReset: now,
      });

      ctx.rateLimit = {
        requests: 1,
        lastReset: now,
      };

      await next();
      return;
    }

    // Очищаем старые запросы
    const windowStart = now - this.config.windowSizeMs;
    userLimit.requests = userLimit.requests.filter(time => time > windowStart);

    // Проверяем лимиты
    const requestsInWindow = userLimit.requests.length;

    if (requestsInWindow >= this.config.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...userLimit.requests);
      const waitTime = Math.ceil((oldestRequest + this.config.windowSizeMs - now) / 1000);

      await ctx.reply(
        `Слишком много запросов. Подождите ${waitTime} секунд перед следующим запросом.`,
      );
      return;
    }

    // Добавляем текущий запрос
    userLimit.requests.push(now);
    userLimit.lastReset = now;

    ctx.rateLimit = {
      requests: requestsInWindow + 1,
      lastReset: now,
    };

    await next();
  };

  // Очистка старых записей (вызывать периодически)
  public cleanup = (): void => {
    const now = Date.now();
    const windowStart = now - this.config.windowSizeMs;

    for (const [telegramId, limit] of this.userLimits.entries()) {
      limit.requests = limit.requests.filter(time => time > windowStart);

      if (limit.requests.length === 0) {
        this.userLimits.delete(telegramId);
      }
    }
  };
}
