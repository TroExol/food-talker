import type {
  CallbackQuery,
  Message,
  Update,
} from 'telegraf/types';

import type { TBotContext, TMessageHandler } from '@/types/telegram';
import type { UserService } from '@/services/user/UserService/UserService';
import type { SearchService } from '@/services/search/SearchService/SearchService';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { EUserState } from '@/types/telegram';
import { EAvailableCities } from '@/config/bot/types';
import { botConfig } from '@/config/bot';

export class MessageHandlers {
  constructor(
    private readonly userService: UserService,
    private readonly searchService: SearchService,
    private readonly messageFormatter: MessageFormatterService,
  ) {}

  public getHandlers = (): TMessageHandler[] => {
    return [
      {
        pattern: /^city:(.+)$/,
        handler: this.handleCitySelection,
      },
      {
        pattern: /^item:(.+)$/,
        handler: this.handleItemSelection,
      },
      {
        pattern: /^history:(.+)$/,
        handler: this.handleHistoryItemSelection,
      },
      {
        pattern: /^page:(\d+)$/,
        handler: this.handlePageNavigation,
      },
      {
        pattern: /^show_more:(\d+)$/,
        handler: this.handleShowMore,
      },
      {
        pattern: /.*/,
        handler: this.handleTextMessage,
      },
    ];
  };

  private handleCitySelection = async (
    _ctx: TBotContext,
  ): Promise<void> => {
    const ctx = _ctx as TBotContext<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    const callbackData = ctx.callbackQuery.data;
    if (!callbackData) {
      await ctx.answerCbQuery('Неверные данные callback');
      return;
    }

    const match = callbackData.match(/^city:(.+)$/);
    if (!match) {
      await ctx.answerCbQuery('Неверный формат выбора города');
      return;
    }

    const selectedCity = match[1] as EAvailableCities;

    // Проверяем, поддерживается ли город
    const supportedCities: EAvailableCities[] = Object.values(EAvailableCities);
    if (!supportedCities.includes(selectedCity)) {
      await ctx.answerCbQuery('Этот город пока не поддерживается');
      return;
    }

    try {
      // Обновляем город пользователя
      await this.userService.updateUserCity(ctx.user.telegramId, selectedCity);

      // Обновляем состояние пользователя
      ctx.user.city = selectedCity;
      ctx.user.state = EUserState.IDLE;

      await ctx.answerCbQuery(`Город изменен на: ${selectedCity}`);

      // Отправляем приветственное сообщение
      const userName = ctx.from?.first_name;
      const formattedMessage = this.messageFormatter.formatWelcomeMessage(userName);

      await ctx.reply(formattedMessage.text, {
        parse_mode: formattedMessage.parseMode,
        reply_markup: formattedMessage.replyMarkup,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при обновлении города', error as Error, {
        telegramId: ctx.from?.id,
        city: selectedCity,
      });
      await ctx.answerCbQuery('Ошибка при обновлении города');
    }
  };

  private handleTextMessage = async (_ctx: TBotContext): Promise<void> => {
    const ctx = _ctx as TBotContext<Update.MessageUpdate<Message.TextMessage>>;

    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    const messageText = ctx.message?.text;
    if (!messageText) {
      return;
    }

    // Если пользователь ожидает выбора города
    if (ctx.user.state === EUserState.WAITING_FOR_CITY) {
      await this.handleCityTextInput(ctx, messageText);
      return;
    }

    // Если пользователь в состоянии IDLE, обрабатываем как поисковый запрос
    if (ctx.user.state === EUserState.IDLE) {
      await this.handleSearchQuery(ctx, messageText);
      return;
    }

    // Неизвестное состояние
    await ctx.reply('Произошла ошибка. Попробуйте команду /start');
  };

  private handleCityTextInput = async (
    ctx: TBotContext<Update.MessageUpdate<Message.TextMessage>>,
    cityText: string,
  ): Promise<void> => {
    const supportedCities: EAvailableCities[] = Object.values(EAvailableCities);
    const normalizedCity = cityText.trim();

    if (!supportedCities.includes(normalizedCity as EAvailableCities)) {
      await ctx.reply(
        `Этот город пока не поддерживается. Доступные города: ${supportedCities.join(', ')}\n\nИспользуйте команду /address для выбора города.`,
      );
      return;
    }

    try {
      // Обновляем город пользователя
      await this.userService.updateUserCity(ctx.user!.telegramId, normalizedCity as EAvailableCities);

      // Обновляем состояние пользователя
      ctx.user!.city = normalizedCity;
      ctx.user!.state = EUserState.IDLE;

      const userName = ctx.from?.first_name;
      const formattedMessage = this.messageFormatter.formatWelcomeMessage(userName);

      await ctx.reply(formattedMessage.text, {
        parse_mode: formattedMessage.parseMode,
        reply_markup: formattedMessage.replyMarkup,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при установке города', error as Error, {
        telegramId: ctx.from?.id,
        city: normalizedCity,
      });
      await ctx.reply('Ошибка при установке города. Попробуйте еще раз.');
    }
  };

  private handleSearchQuery = async (
    ctx: TBotContext<Update.MessageUpdate<Message.TextMessage>>,
    query: string,
  ): Promise<void> => {
    if (!ctx.user?.city) {
      await ctx.reply(
        'Сначала выберите город для доставки командой /address',
      );
      return;
    }

    // Проверяем длину запроса
    if (query.length > botConfig.sanitizer.userSearchPrompt.maxLength) {
      await ctx.reply(
        'Запрос слишком длинный. Максимальная длина - 500 символов.',
      );
      return;
    }

    if (query.length < botConfig.sanitizer.userSearchPrompt.minLength) {
      await ctx.reply(
        'Запрос слишком короткий. Опишите, что хотите найти.',
      );
      return;
    }

    // Устанавливаем состояние ожидания обработки запроса
    ctx.user.state = EUserState.WAITING_FOR_SEARCH_QUERY;

    try {
      const botMessage = await ctx.reply('🔍 Ищу для вас...');

      const timeout = setTimeout(() => {
        void ctx.telegram.editMessageText(ctx.chat.id, botMessage.message_id, undefined, '🔍 Перебираю варианты...');
      }, 10000);

      // Выполняем поиск через SearchService
      const results = await this.searchService.searchFood(query, ctx.user.telegramId, {
        enableLLMEnhancement: true,
        enableVectorSearch: true,
        maxEnhenceMenu: 60,
      });

      if (results.length === 0) {
        clearTimeout(timeout);
        await ctx.telegram.deleteMessage(ctx.chat.id, botMessage.message_id);

        const noResultsMessage = this.messageFormatter.formatNoResultsMessage(query);
        await ctx.reply(noResultsMessage.text, {
          parse_mode: noResultsMessage.parseMode,
          reply_markup: noResultsMessage.replyMarkup,
        });
        return;
      }

      // Форматируем результаты
      clearTimeout(timeout);
      await ctx.telegram.deleteMessage(ctx.chat.id, botMessage.message_id);

      const formattedResults = this.messageFormatter.formatSearchResults(results);
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

  // Обработчики callback'ов для inline кнопок
  private handleItemSelection = async (_ctx: TBotContext): Promise<void> => {
    const ctx = _ctx as TBotContext<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    const callbackData = ctx.callbackQuery.data;
    if (!callbackData) {
      await ctx.answerCbQuery('Неверные данные callback');
      return;
    }

    const match = callbackData.match(/^item:(.+)$/);
    if (!match) {
      await ctx.answerCbQuery('Неверный формат выбора блюда');
      return;
    }

    const itemId = match[1];

    try {
      await ctx.answerCbQuery('Загружаем информацию о блюде...');

      // TODO: Получить детальную информацию о блюде из SearchService
      // const itemDetails = await this.searchService.getItemDetails(itemId);

      await ctx.reply(`🍽️ <b>Детальная информация о блюде</b>\n\nID: ${itemId}\n\nФункция в разработке...`, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при получении информации о блюде', error as Error, {
        telegramId: ctx.from?.id,
        itemId,
      });
      await ctx.answerCbQuery('Ошибка при загрузке информации о блюде');
    }
  };

  private handleHistoryItemSelection = async (_ctx: TBotContext): Promise<void> => {
    const ctx = _ctx as TBotContext<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    const callbackData = ctx.callbackQuery.data;
    if (!callbackData) {
      await ctx.answerCbQuery('Неверные данные callback');
      return;
    }

    const match = callbackData.match(/^history:(.+)$/);
    if (!match) {
      await ctx.answerCbQuery('Неверный формат выбора из истории');
      return;
    }

    const itemId = match[1];

    try {
      await ctx.answerCbQuery('Повторяем поиск...');

      // TODO: Получить информацию о блюде из истории и повторить поиск
      await ctx.reply(`📋 <b>Повторный поиск</b>\n\nID: ${itemId}\n\nФункция в разработке...`, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при повторном поиске', error as Error, {
        telegramId: ctx.from?.id,
        itemId,
      });
      await ctx.answerCbQuery('Ошибка при повторном поиске');
    }
  };

  private handlePageNavigation = async (_ctx: TBotContext): Promise<void> => {
    const ctx = _ctx as TBotContext<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    const callbackData = ctx.callbackQuery.data;
    if (!callbackData) {
      await ctx.answerCbQuery('Неверные данные callback');
      return;
    }

    const match = callbackData.match(/^page:(\d+)$/);
    if (!match) {
      await ctx.answerCbQuery('Неверный формат навигации');
      return;
    }

    const pageNumber = parseInt(match[1], 10);

    try {
      await ctx.answerCbQuery(`Переходим на страницу ${pageNumber}...`);

      // TODO: Получить результаты для указанной страницы
      await ctx.reply(`📄 <b>Навигация по страницам</b>\n\nСтраница: ${pageNumber}\n\nФункция в разработке...`, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при навигации по страницам', error as Error, {
        telegramId: ctx.from?.id,
        pageNumber,
      });
      await ctx.answerCbQuery('Ошибка при навигации');
    }
  };

  private handleShowMore = async (_ctx: TBotContext): Promise<void> => {
    const ctx = _ctx as TBotContext<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    const callbackData = ctx.callbackQuery.data;
    if (!callbackData) {
      await ctx.answerCbQuery('Неверные данные callback');
      return;
    }

    const match = callbackData.match(/^show_more:(\d+)$/);
    if (!match) {
      await ctx.answerCbQuery('Неверный формат показа дополнительных результатов');
      return;
    }

    const currentPage = parseInt(match[1], 10);

    try {
      await ctx.answerCbQuery('Загружаем дополнительные результаты...');

      // TODO: Получить дополнительные результаты
      await ctx.reply(`📄 <b>Дополнительные результаты</b>\n\nТекущая страница: ${currentPage}\n\nФункция в разработке...`, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка при загрузке дополнительных результатов', error as Error, {
        telegramId: ctx.from?.id,
        currentPage,
      });
      await ctx.answerCbQuery('Ошибка при загрузке результатов');
    }
  };
}
