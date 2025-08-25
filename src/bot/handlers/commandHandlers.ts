import type { TBotContext, TCommandHandler } from '@/types/telegram';
import type { TUserService } from '@/services/user/UserService/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { EBotCommand, EUserState } from '@/types/telegram';
import { EAvailableCities } from '@/config/bot/types';

export class CommandHandlers {
  constructor(
    private readonly userService: TUserService,
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

    const welcomeMessage = `
🍕 Добро пожаловать в Food Talker!

Я помогу вам найти вкусную еду в вашем городе. Просто напишите, что хотите съесть, например:
• "Хочу пиццу с пепперони"
• "Ищу суши с лососем"
• "Покажи бургеры до 500 рублей"

${ctx.user.state === EUserState.WAITING_FOR_CITY
  ? 'Сначала выберите город для доставки:'
  : `Ваш город: ${ctx.user.city}`}

Доступные команды:
/help - Справка
/address - Изменить город
/history - История поиска
/cancel - Отменить действие
    `.trim();

    if (ctx.user.state === EUserState.WAITING_FOR_CITY) {
      await this.showCitySelection(ctx);
    } else {
      await ctx.reply(welcomeMessage);
    }
  };

  private handleHelp = async (ctx: TBotContext): Promise<void> => {
    const helpMessage = `
📖 Справка по командам Food Talker

🔍 Поиск еды:
Просто напишите, что хотите съесть! Например:
• "Пицца с грибами"
• "Суши с лососем до 1000 рублей"
• "Веганские блюда"
• "Бургеры из вкусно и точка"

📋 Команды:
/start - Запустить бота
/help - Показать эту справку
/address - Изменить город доставки
/history - История поиска (последние 5 запросов)
/cancel - Отменить текущее действие

🏙️ Поддерживаемые города:
• Пермь
• Воронеж

💡 Советы:
• Используйте естественный язык для поиска
• Указывайте ценовой диапазон: "до 500 рублей"
• Можете исключить рестораны: "не Макдональдс"
• Указывайте диету: "веганское", "без глютена"
    `.trim();

    await ctx.reply(helpMessage);
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
        await ctx.reply('История поиска пуста. Попробуйте найти что-нибудь вкусное!');
        return;
      }

      let historyMessage = '📋 История поиска:\n\n';

      for (let i = 0; i < history.length; i++) {
        const item = history[i];
        const date = new Date(item.timestamp).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        historyMessage += `${i + 1}. "${item.query}"\n`;
        historyMessage += `   📅 ${date} | 🔍 ${item.resultsCount || 0} результатов\n\n`;
      }

      await ctx.reply(historyMessage);
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
