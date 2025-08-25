import type {
  CallbackQuery,
  Message,
  Update,
} from 'telegraf/types';

import type { TBotContext, TMessageHandler } from '@/types/telegram';
import type { TUserService } from '@/services/user/UserService/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { EUserState } from '@/types/telegram';
import { EAvailableCities } from '@/config/bot/types';
import { botConfig } from '@/config/bot';

export class MessageHandlers {
  constructor(private readonly userService: TUserService) {}

  public getHandlers = (): TMessageHandler[] => {
    return [
      {
        pattern: /^city:(.+)$/,
        handler: this.handleCitySelection,
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
      const welcomeMessage = `
✅ Город успешно изменен на: ${selectedCity}

Теперь вы можете искать еду! Просто напишите, что хотите съесть, например:
• "Хочу пиццу с пепперони"
• "Ищу суши с лососем"
• "Покажи бургеры до 500 рублей"
      `.trim();

      await ctx.reply(welcomeMessage);
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

    const messageText = ctx.message.text;
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

      const welcomeMessage = `
✅ Город успешно установлен: ${normalizedCity}

Теперь вы можете искать еду! Просто напишите, что хотите съесть, например:
• "Хочу пиццу с пепперони"
• "Ищу суши с лососем"
• "Покажи бургеры до 500 рублей"
      `.trim();

      await ctx.reply(welcomeMessage);
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
      await ctx.reply('🔍 Ищу для вас...');

      // TODO: Здесь будет интеграция с SearchService
      // const results = await this.searchService.searchFood(query, ctx.user.telegramId);

      // Временная заглушка
      await ctx.reply(
        `Поиск по запросу "${query}" в городе ${ctx.user.city} будет реализован в следующих задачах.`,
      );
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
}
