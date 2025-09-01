import type { TBotContext } from '@/types/telegram';
import type { UserService } from '@/services/user/UserService/UserService';

import { AppError } from '@/utils/AppError';
import { EUserState } from '@/types/telegram';

export class AuthMiddleware {
  constructor(
    private readonly userService: UserService,
  ) {}

  public authenticate = async (ctx: TBotContext, next: () => Promise<void>): Promise<void> => {
    const telegramId = ctx.from?.id ? ctx.from.id.toString() : undefined;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : undefined;

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
  };
}
