import type { TBotContext } from '@/types/telegram';
import type { UserService } from '@/services/user/UserService/UserService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { EUserState } from '@/types/telegram';

export class AuthMiddleware {
  constructor(
    private readonly userService: UserService,
  ) {}

  public authenticate = async (ctx: TBotContext, next: () => Promise<void>): Promise<void> => {
    try {
      const telegramId = ctx.from?.id;
      const chatId = ctx.chat?.id;

      if (!telegramId || !chatId) {
        throw AppError.validationError('Неверные данные пользователя');
      }

      // Получаем или создаем пользователя
      let user = await this.userService.getUser(telegramId);

      if (!user) {
        // Создаем нового пользователя
        user = await this.userService.createUser(telegramId, chatId);

        // Устанавливаем состояние ожидания города
        ctx.user = {
          telegramId,
          chatId,
          state: EUserState.WAITING_FOR_CITY,
        };
      } else {
        // Пользователь существует, устанавливаем состояние IDLE
        ctx.user = {
          telegramId,
          chatId,
          state: EUserState.IDLE,
          city: user.city,
        };
      }

      await next();
    } catch (error) {
      ConsoleLogger.error('Ошибка при аутентификации', error as Error, {
        telegramId: ctx.from?.id,
      });

      if (error instanceof AppError) {
        await ctx.reply('Произошла ошибка аутентификации. Попробуйте еще раз.');
      } else {
        await ctx.reply('Системная ошибка. Попробуйте позже.');
      }
    }
  };
}
