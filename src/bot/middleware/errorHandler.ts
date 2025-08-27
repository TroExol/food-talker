import type { TBotContext } from '@/types/telegram';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';
import type { AdminNotificationService } from '@/services/admin/AdminNotificationService/AdminNotificationService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError, EErrorType } from '@/utils/AppError';
import { EAvailableCities } from '@/config/bot/types';

export class ErrorHandlerMiddleware {
  constructor(
    private readonly messageFormatter: MessageFormatterService,
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  public handleError = async (ctx: TBotContext, next: () => Promise<void>): Promise<void> => {
    try {
      await next();
    } catch (error) {
      ConsoleLogger.error('Bot error:', error as Error);

      // Отправляем уведомление админу для критических ошибок
      if (error instanceof AppError) {
        // Отправляем уведомление для всех критических ошибок, кроме пользовательских
        if (this.isCriticalError(error)) {
          await this.adminNotificationService.notifyAdmin(error, {
            userId: ctx.from?.id,
            chatId: ctx.chat?.id,
            username: ctx.from?.username,
          });
        }
      } else if (error instanceof Error) {
        // Отправляем уведомление для всех системных ошибок
        await this.adminNotificationService.notifySystemError(error, {
          userId: ctx.from?.id,
          chatId: ctx.chat?.id,
          username: ctx.from?.username,
        });
      }

      let message = 'Произошла ошибка. Попробуйте позже.';

      if (error instanceof AppError) {
        switch (error.type) {
          case EErrorType.API_ERROR:
            message = 'Ошибка при получении данных. Попробуйте позже.';
            break;
          case EErrorType.CITY_NOT_SUPPORTED:
            message = `Этот город пока не поддерживается. Доступные города: ${Object.values(EAvailableCities).join(', ')}`;
            break;
          case EErrorType.LLM_ERROR:
            message = 'Ошибка обработки запроса. Попробуйте переформулировать вопрос.';
            break;
          case EErrorType.RATE_LIMIT_ERROR:
            message = 'Слишком много запросов. Подождите немного и попробуйте снова.';
            break;
          case EErrorType.USER_NOT_FOUND:
            message = 'Пользователь не найден. Попробуйте перезапустить бота командой /start';
            break;
          case EErrorType.VALIDATION_ERROR:
            message = `Ошибка валидации: ${error.message}`;
            break;
          default:
            message = error.message || 'Произошла ошибка. Попробуйте позже.';
        }
      } else if (error instanceof Error) {
        message = 'Системная ошибка. Попробуйте позже.';
      }

      try {
        if (error instanceof AppError) {
          const formattedError = this.messageFormatter.formatErrorMessage(error);
          await ctx.reply(formattedError.text, {
            parse_mode: formattedError.parseMode,
            reply_markup: formattedError.replyMarkup,
          });
        } else {
          await ctx.reply(message);
        }
      } catch (replyError) {
        ConsoleLogger.error('Не удалось отправить сообщение об ошибке:', replyError as Error);
      }
    }
  };

  private isCriticalError(error: AppError): boolean {
    // Критические ошибки, которые требуют внимания админа
    const criticalErrorTypes = [
      EErrorType.API_ERROR,
      EErrorType.DATABASE_ERROR,
      EErrorType.LLM_ERROR,
      EErrorType.EMBEDDING_ERROR,
      EErrorType.CACHE_ERROR,
      EErrorType.DATA_COLLECTION_ERROR,
      EErrorType.SYSTEM_ERROR,
    ];

    return criticalErrorTypes.includes(error.type);
  }
}
