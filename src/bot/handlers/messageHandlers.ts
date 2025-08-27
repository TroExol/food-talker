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
        pattern: /^item:(.+):(.+)$/,
        handler: this.handleItemSelection,
      },
      {
        pattern: /^delete_message$/,
        handler: this.handleDeleteMessage,
      },
      {
        pattern: /^history:(.+)$/,
        handler: this.handleHistoryItemSelection,
      },
      {
        pattern: /^page:(.+):(\d+)$/,
        handler: this.handlePageNavigation,
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

      if (ctx.callbackQuery.message && ctx.chat) {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id);
      }

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
      const searchHistory = await this.userService.getSearchHistory(ctx.user.telegramId, 1);

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

    const match = callbackData.match(/^item:(.+):(.+)$/);
    if (!match) {
      await ctx.answerCbQuery('Неверный формат выбора блюда');
      return;
    }

    const searchHistoryId = match[1];
    const itemId = match[2];

    try {
      await ctx.answerCbQuery('Загружаем информацию о блюде...');

      const searchHistory = await this.userService.getSearchHistoryItemById(ctx.user.telegramId, searchHistoryId);
      if (!searchHistory) {
        await ctx.answerCbQuery('История поиска не найдена');
        return;
      }
      const searchResultItem = searchHistory.results.find(result => result.id === itemId);
      if (!searchResultItem) {
        await ctx.answerCbQuery('Блюдо не найдено');
        return;
      }

      const formattedMessage = this.messageFormatter.formatMenuItem(searchResultItem);

      if (formattedMessage.photo) {
        // Отправляем фото с подписью
        await ctx.replyWithPhoto(formattedMessage.photo, {
          caption: formattedMessage.text,
          parse_mode: formattedMessage.parseMode,
          reply_markup: formattedMessage.replyMarkup,
        });
      } else {
        // Отправляем только текст
        await ctx.reply(formattedMessage.text, {
          parse_mode: formattedMessage.parseMode,
          reply_markup: formattedMessage.replyMarkup,
        });
      }
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

    const historyItemId = match[1];

    try {
      await ctx.answerCbQuery('Повторяем поиск...');

      // Получаем элемент истории
      const historyItem = await this.userService.getSearchHistoryItemById(ctx.user.telegramId, historyItemId);
      if (!historyItem) {
        await ctx.answerCbQuery('Запрос из истории не найден');
        return;
      }

      await this.handleSearchQuery(
        ctx as unknown as TBotContext<Update.MessageUpdate<Message.TextMessage>>,
        historyItem.query,
      );
    } catch (error) {
      ConsoleLogger.error('Ошибка при повторном поиске', error as Error, {
        telegramId: ctx.from?.id,
        historyItemId,
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

    const match = callbackData.match(/^page:(.+):(\d+)$/);
    if (!match) {
      await ctx.answerCbQuery('Неверный формат навигации');
      return;
    }

    const searchHistoryId = match[1];
    const pageNumber = parseInt(match[2], 10);

    try {
      await ctx.answerCbQuery(`Переходим на страницу ${pageNumber}...`);

      // Получаем историю поиска
      const searchHistory = await this.userService.getSearchHistoryItemById(ctx.user.telegramId, searchHistoryId);
      if (!searchHistory) {
        await ctx.answerCbQuery('История поиска не найдена');
        return;
      }

      // Форматируем результаты для указанной страницы
      const formattedResults = this.messageFormatter.formatSearchResults(
        searchHistory.results,
        searchHistoryId,
        pageNumber,
      );

      // Обновляем сообщение с новыми результатами
      if (ctx.callbackQuery.message && ctx.chat) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          undefined,
          formattedResults.text,
          {
            parse_mode: formattedResults.parseMode,
            reply_markup: formattedResults.replyMarkup,
          },
        );
      }
    } catch (error) {
      ConsoleLogger.error('Ошибка при навигации по страницам', error as Error, {
        telegramId: ctx.from?.id,
        searchHistoryId,
        pageNumber,
      });
      await ctx.answerCbQuery('Ошибка при навигации');
    }
  };

  private handleDeleteMessage = async (_ctx: TBotContext): Promise<void> => {
    const ctx = _ctx as TBotContext<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

    if (!ctx.user) {
      throw AppError.userNotFound(ctx.from?.id ?? 0);
    }

    const callbackData = ctx.callbackQuery.data;
    if (!callbackData) {
      await ctx.answerCbQuery('Неверные данные callback');
      return;
    }

    try {
      await ctx.answerCbQuery('Удаляем сообщение...');

      // Удаляем сообщение с блюдом
      if (ctx.callbackQuery.message && ctx.chat) {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id);
      }
    } catch (error) {
      ConsoleLogger.error('Ошибка при удалении сообщения', error as Error, {
        telegramId: ctx.from?.id,
        messageId: ctx.callbackQuery.message?.message_id,
      });
      await ctx.answerCbQuery('Ошибка при удалении сообщения');
    }
  };
}
