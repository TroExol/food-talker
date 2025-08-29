import type { CallbackQuery } from 'telegraf/types';

import { Telegraf } from 'telegraf';

import type { TBotContext, TRateLimitConfig } from '@/types/telegram';
import type { UserService } from '@/services/user/UserService/UserService';
import type { SearchService } from '@/services/search/SearchService/SearchService';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';
import type { AnalyticsService } from '@/services/analytics/AnalyticsService/AnalyticsService';
import type { AdminNotificationService } from '@/services/admin/AdminNotificationService/AdminNotificationService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';

import { RateLimitMiddleware } from './middleware/rateLimit';
import { ErrorHandlerMiddleware } from './middleware/errorHandler';
import { AuthMiddleware } from './middleware/auth';
import { MessageHandlers } from './handlers/messageHandlers';
import { CommandHandlers } from './handlers/commandHandlers';

export class Bot {
  public readonly telegraf: Telegraf<TBotContext>;
  private readonly authMiddleware: AuthMiddleware;
  private readonly rateLimitMiddleware: RateLimitMiddleware;
  private readonly errorHandlerMiddleware: ErrorHandlerMiddleware;
  private readonly commandHandlers: CommandHandlers;
  private readonly messageHandlers: MessageHandlers;
  private readonly rateLimitConfig: TRateLimitConfig;

  constructor(
    private readonly token: string,
    private readonly userService: UserService,
    private readonly searchService: SearchService,
    private readonly messageFormatter: MessageFormatterService,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly analyticsService: AnalyticsService,
  ) {
    this.telegraf = new Telegraf<TBotContext>(token);

    this.rateLimitConfig = {
      maxRequestsPerMinute: 30,
      maxRequestsPerHour: 300,
      windowSizeMs: 60 * 1000, // 1 минута
    };

    this.authMiddleware = new AuthMiddleware(userService);
    this.rateLimitMiddleware = new RateLimitMiddleware(this.rateLimitConfig);

    this.errorHandlerMiddleware = new ErrorHandlerMiddleware(
      messageFormatter,
      adminNotificationService,
      analyticsService,
    );
    this.commandHandlers = new CommandHandlers(userService, searchService, messageFormatter, analyticsService);
    this.messageHandlers = new MessageHandlers(userService, searchService, messageFormatter, analyticsService);

    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware = (): void => {
    // Порядок middleware важен!

    // 1. Обработка ошибок (должна быть первой)
    this.telegraf.use(this.errorHandlerMiddleware.handleError.bind(this.errorHandlerMiddleware));

    // 2. Rate limiting
    this.telegraf.use(this.rateLimitMiddleware.checkRateLimit.bind(this.rateLimitMiddleware));

    // 3. Аутентификация
    this.telegraf.use(this.authMiddleware.authenticate.bind(this.authMiddleware));
  };

  private setupHandlers = (): void => {
    // Регистрируем команды
    const commandHandlers = this.commandHandlers.getHandlers();
    for (const handler of commandHandlers) {
      this.telegraf.command(handler.command, handler.handler);
    }

    void this.telegraf.telegram.setMyCommands(commandHandlers);

    // Регистрируем обработчики callback'ов
    this.telegraf.on('callback_query', ctx => {
      const callbackData = (ctx.callbackQuery as CallbackQuery.DataQuery)?.data;
      if (!callbackData) {
        void ctx.answerCbQuery('Неверные данные callback');
        return;
      }

      const messageHandlers = this.messageHandlers.getHandlers();
      for (const handler of messageHandlers) {
        if (typeof handler.pattern === 'string') {
          if (callbackData === handler.pattern) {
            void handler.handler(ctx).catch(error => {
              ConsoleLogger.error('Ошибка при обработке callback', error as Error, {
                callbackData,
              });
            });
            return;
          }
        } else if (handler.pattern.test(callbackData)) {
          void handler.handler(ctx).catch(error => {
            ConsoleLogger.error('Ошибка при обработке callback', error as Error, {
              callbackData,
            });
          });
          return;
        }
      }

      void ctx.answerCbQuery('Неизвестный callback');
    });

    // Регистрируем обработчики текстовых сообщений
    this.telegraf.on('text', ctx => {
      const messageText = ctx.message?.text;
      if (!messageText) {
        return;
      }

      const messageHandlers = this.messageHandlers.getHandlers();
      for (const handler of messageHandlers) {
        if (typeof handler.pattern === 'string') {
          if (messageText === handler.pattern) {
            void handler.handler(ctx).catch(error => {
              ConsoleLogger.error('Ошибка при обработке текстового сообщения', error as Error, {
                messageText,
              });
            });
            return;
          }
        } else if (handler.pattern.test(messageText)) {
          void handler.handler(ctx).catch(error => {
            ConsoleLogger.error('Ошибка при обработке текстового сообщения', error as Error, {
              messageText,
            });
          });
          return;
        }
      }
    });
  };

  public start = async (): Promise<void> => {
    try {
      ConsoleLogger.info('Запускаем Telegram бота...');

      // Запускаем периодическую очистку rate limit
      setInterval(() => {
        this.rateLimitMiddleware.cleanup();
      }, 5 * 60 * 1000); // Каждые 5 минут

      // Запускаем бота в режиме polling
      await this.telegraf.launch();
    } catch (error) {
      ConsoleLogger.error('Ошибка работы бота:', error as Error);
      void this.start();
    }
  };

  public stop = (): void => {
    try {
      ConsoleLogger.info('Останавливаем Telegram бота...');
      this.telegraf.stop();
      ConsoleLogger.info('Telegram бот остановлен успешно');
    } catch (error) {
      ConsoleLogger.error('Не удалось остановить Telegram бота:', error as Error);
      throw error;
    }
  };

  // Метод для graceful shutdown
  public gracefulShutdown = (): void => {
    ConsoleLogger.info('Завершаем работу Telegram бота...');
    this.stop();
  };
}
