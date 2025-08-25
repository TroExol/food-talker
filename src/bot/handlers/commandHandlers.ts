import type { TBotContext, TCommandHandler } from '@/types/telegram';
import type { TUserService } from '@/services/user/UserService/types';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { EBotCommand, EUserState } from '@/types/telegram';
import { EAvailableCities } from '@/config/bot/types';

export class CommandHandlers {
  constructor(
    private readonly userService: TUserService,
    private readonly messageFormatter: MessageFormatterService,
  ) {}

  public getHandlers = (): TCommandHandler[] => {
    return [
      {
        command: EBotCommand.START,
        description: 'Запустить бота и начать работу',
        handler: this.handleStart,
      },
      {
        command: EBotCommand.HELP,
        description: 'Показать справку по командам',
        handler: this.handleHelp,
      },
      {
        command: EBotCommand.ADDRESS,
        description: 'Изменить город доставки',
        handler: this.handleAddress,
      },
      {
        command: EBotCommand.HISTORY,
        description: 'Показать историю поиска',
        handler: this.handleHistory,
      },
      {
        command: EBotCommand.CANCEL,
        description: 'Отменить текущее действие',
        handler: this.handleCancel,
      },
    ];
  };

  private handleStart = async (ctx: TBotContext): Promise<void> => {
    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    if (ctx.user.state === EUserState.WAITING_FOR_CITY) {
      await this.showCitySelection(ctx);
    } else {
      const userName = ctx.from?.first_name;
      const formattedMessage = this.messageFormatter.formatWelcomeMessage(userName);

      await ctx.reply(formattedMessage.text, {
        parse_mode: formattedMessage.parseMode,
        reply_markup: formattedMessage.replyMarkup,
      });
    }
  };

  private handleHelp = async (ctx: TBotContext): Promise<void> => {
    const formattedMessage = this.messageFormatter.formatHelpMessage();

    await ctx.reply(formattedMessage.text, {
      parse_mode: formattedMessage.parseMode,
      reply_markup: formattedMessage.replyMarkup,
    });
  };

  private handleAddress = async (ctx: TBotContext): Promise<void> => {
    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    ctx.user.state = EUserState.WAITING_FOR_CITY;
    await this.showCitySelection(ctx);
  };

  private handleHistory = async (ctx: TBotContext): Promise<void> => {
    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    try {
      const history = await this.userService.getSearchHistory(ctx.user.telegramId, 10);

      if (history.length === 0) {
        const formattedMessage = this.messageFormatter.formatHistoryMessage([]);
        await ctx.reply(formattedMessage.text, {
          parse_mode: formattedMessage.parseMode,
          reply_markup: formattedMessage.replyMarkup,
        });
        return;
      }

      // Преобразуем историю в формат для MessageFormatter
      const historyItems = history.flatMap(item => item.results || []);
      const formattedMessage = this.messageFormatter.formatHistoryMessage(historyItems);

      await ctx.reply(formattedMessage.text, {
        parse_mode: formattedMessage.parseMode,
        reply_markup: formattedMessage.replyMarkup,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при получении истории поиска', error as Error, {
        telegramId: ctx.from?.id,
      });
      await ctx.reply('Не удалось загрузить историю поиска. Попробуйте позже.');
    }
  };

  private handleCancel = async (ctx: TBotContext): Promise<void> => {
    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    ctx.user.state = EUserState.IDLE;

    await ctx.reply(
      '✅ Действие отменено. Вы можете начать новый поиск или использовать команды.',
    );
  };

  private showCitySelection = async (ctx: TBotContext): Promise<void> => {
    const cities: EAvailableCities[] = [EAvailableCities.PERM, EAvailableCities.VORONEZH];

    const keyboard = {
      inline_keyboard: cities.map(city => ([{
        text: city,
        callback_data: `city:${city}`,
      }])),
    };

    await ctx.reply(
      '🏙️ Выберите город для доставки:',
      { reply_markup: keyboard },
    );
  };
}
