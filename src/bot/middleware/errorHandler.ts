import type { TBotContext } from '@/types/telegram';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError, EErrorType } from '@/utils/AppError';
import { EAvailableCities } from '@/config/bot/types';

export class ErrorHandlerMiddleware {
  constructor(private readonly messageFormatter: MessageFormatterService) {}

  public handleError = async (ctx: TBotContext, next: () => Promise<void>): Promise<void> => {
    try {
      await next();
    } catch (error) {
      ConsoleLogger.error('Bot error:', error as Error);

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
}
