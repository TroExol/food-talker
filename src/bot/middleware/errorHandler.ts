import type { TBotContext } from '@/types/telegram';

import { AppError, EErrorType } from '@/utils/AppError';
import { EAvailableCities } from '@/config/bot/types';

export class ErrorHandlerMiddleware {
  public handleError = async (ctx: TBotContext, next: () => Promise<void>): Promise<void> => {
    try {
      await next();
    } catch (error) {
      console.error('Bot error:', error);

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
        await ctx.reply(message);
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  };
}
