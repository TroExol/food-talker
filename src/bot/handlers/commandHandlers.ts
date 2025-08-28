import type { TBotContext, TCommandHandler } from '@/types/telegram';
import type { UserService } from '@/services/user/UserService/UserService';
import type { SearchService } from '@/services/search/SearchService/SearchService';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { EBotCommand, EUserState } from '@/types/telegram';
import { ESubscriptionType } from '@/services/user/UserRepository/types';
import { EAvailableCities } from '@/config/bot/types';

export class CommandHandlers {
  constructor(
    private readonly userService: UserService,
    private readonly searchService: SearchService,
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
        command: EBotCommand.SEARCH,
        description: 'Поиск еды по запросу',
        handler: this.handleSearch,
      },
      {
        command: EBotCommand.SUPPORT,
        description: 'Связаться с поддержкой',
        handler: this.handleSupport,
      },
      {
        command: EBotCommand.STATS,
        description: 'Показать статистику поиска',
        handler: this.handleStats,
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

      const formattedMessage = this.messageFormatter.formatHistoryMessage(history);

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

  private handleSearch = async (ctx: TBotContext): Promise<void> => {
    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('Использование: /search <запрос>\n\nПример: /search пицца с грибами');
      return;
    }

    const query = ctx.message.text.replace(/^\/search(?:@\w+)?\s*/, '').trim();

    if (!query) {
      await ctx.reply('Использование: /search <запрос>\n\nПример: /search пицца с грибами');
      return;
    }

    // Проверяем длину запроса
    if (query.length > 500) {
      await ctx.reply('Запрос слишком длинный. Максимальная длина - 500 символов.');
      return;
    }

    if (query.length < 3) {
      await ctx.reply('Запрос слишком короткий. Опишите, что хотите найти.');
      return;
    }

    if (!ctx.user.city) {
      await ctx.reply('Сначала выберите город для доставки командой /address');
      return;
    }

    const canSearch = await this.userService.checkSearchLimit(ctx.user.telegramId);
    if (!canSearch) {
      await ctx.reply('Достигнут лимит поиска. Воспользуйтесь командой /stats для подробной информации.');
      return;
    }

    // Устанавливаем состояние ожидания обработки запроса
    ctx.user.state = EUserState.WAITING_FOR_SEARCH_QUERY;

    try {
      const botMessage = await ctx.reply('🔍 Ищу для вас...');

      const timeout = setTimeout(() => {
        if (ctx.chat) {
          void ctx.telegram.editMessageText(ctx.chat.id, botMessage.message_id, undefined, '🔍 Перебираю варианты...');
        }
      }, 10000);

      // Выполняем поиск через SearchService
      const results = await this.searchService.searchFood(query, ctx.user.telegramId, {
        enableLLMEnhancement: true,
        enableVectorSearch: true,
        maxEnhenceMenu: 60,
      });
      const searchHistory = await this.userService.getSearchHistory(ctx.user.telegramId, 1);

      if (results.length === 0) {
        clearTimeout(timeout);
        if (ctx.chat) {
          await ctx.telegram.deleteMessage(ctx.chat.id, botMessage.message_id);
        }

        const noResultsMessage = this.messageFormatter.formatNoResultsMessage(query);
        await ctx.reply(noResultsMessage.text, {
          parse_mode: noResultsMessage.parseMode,
          reply_markup: noResultsMessage.replyMarkup,
        });
        return;
      }

      // Форматируем результаты
      clearTimeout(timeout);
      if (ctx.chat) {
        await ctx.telegram.deleteMessage(ctx.chat.id, botMessage.message_id);
      }

      const formattedResults = this.messageFormatter.formatSearchResults(results, searchHistory[0]?.id);
      await ctx.reply(formattedResults.text, {
        parse_mode: formattedResults.parseMode,
        reply_markup: formattedResults.replyMarkup,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при поиске', error as Error, {
        telegramId: ctx.from?.id,
        city: ctx.user.city,
        query,
      });
      await ctx.reply('Ошибка при поиске. Попробуйте еще раз.');
    } finally {
      ctx.user.state = EUserState.IDLE;
    }
  };

  private handleSupport = async (ctx: TBotContext): Promise<void> => {
    const text = `🆘 <b>Поддержка</b>

Если у вас есть вопросы или проблемы, обращайтесь в наш канал поддержки:

📱 <a href="https://t.me/foodtalker_support">@foodtalker_support</a>

Наши специалисты помогут вам решить любые вопросы!`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
    });
  };

  private handleStats = async (ctx: TBotContext): Promise<void> => {
    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    try {
      const stats = await this.userService.getSearchStats(ctx.user.telegramId);
      const user = await this.userService.getUser(ctx.user.telegramId);

      if (!user) {
        throw AppError.userNotFound(ctx.user.telegramId);
      }

      const subscriptionText = user.subscription === ESubscriptionType.BASIC ? 'Базовая' : 'Премиум';
      const lastSearchText = stats.lastSearchDate
        ? new Date(stats.lastSearchDate).toLocaleDateString('ru-RU')
        : 'Нет';

      const text = `📊 <b>Статистика поиска</b>

👤 <b>Подписка:</b> ${subscriptionText}
🔍 <b>Поисков сегодня:</b> ${stats.searchesToday}/${stats.searchLimit}
📈 <b>Поисков за месяц:</b> ${stats.searchesThisMonth}
📊 <b>Всего поисков:</b> ${stats.totalSearches}
📅 <b>Последний поиск:</b> ${lastSearchText}

${stats.remainingSearches > 0
    ? `✅ Осталось поисков сегодня: ${stats.remainingSearches}`
    : '❌ Достигнут дневной лимит поиска'
}`;

      await ctx.reply(text, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при получении статистики', error as Error, {
        telegramId: ctx.from?.id,
      });
      await ctx.reply('Не удалось загрузить статистику. Попробуйте позже.');
    }
  };

  private showCitySelection = async (ctx: TBotContext): Promise<void> => {
    const cities: EAvailableCities[] = Object.values(EAvailableCities);

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
