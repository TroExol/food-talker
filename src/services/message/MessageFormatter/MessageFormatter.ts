import type { InlineKeyboardButton } from 'telegraf/types';

import type { AppError } from '@/utils/AppError';
import type { TInlineKeyboardMarkup } from '@/types/telegram';
import type { TSearchResultItem } from '@/types/search';
import type { TRestaurant } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';
import type { TSearchHistoryItem } from '@/services/user/UserRepository/types';

import { EAvailableCities } from '@/config/bot/types';

import type {
  TFormattedMessage,
  TFormattingConfig,
  TPaginationConfig,
  TSearchResultsPage,
} from './types';

export class MessageFormatterService {
  private readonly paginationConfig: TPaginationConfig = {
    itemsPerPage: 5, // Максимум 5 результатов на страницу
  };

  private readonly formattingConfig: TFormattingConfig = {
    maxDescriptionLength: 200,
    maxIngredientsLength: 150,
    showPrice: true,
    showRestaurant: true,
    showIngredients: true,
    showOrderButton: true,
    showMoreButton: true,
  };

  // Форматирование результатов поиска
  public formatSearchResults = (
    results: TSearchResultItem[],
    searchHistoryId?: string,
    page = 1,
  ): TFormattedMessage => {
    const paginatedResults = this.paginateResults(results, page, this.paginationConfig.itemsPerPage);
    return this.formatSearchResultsPage(paginatedResults, searchHistoryId);
  };

  public formatSearchResultsPage = (page: TSearchResultsPage, searchHistoryId?: string): TFormattedMessage => {
    if (page.items.length === 0) {
      return this.formatNoResultsMessage();
    }

    const startIndex = (page.currentPage - 1) * this.paginationConfig.itemsPerPage;
    const itemsText = page.items.map((item, index) =>
      this.formatSearchResultItem(item, startIndex + index + 1),
    ).join('\n\n');

    const headerText = this.formatSearchResultsHeader(page);
    const footerText = this.formatSearchResultsFooter(page);

    const text = `${headerText}\n\n${itemsText}${searchHistoryId ? `\n\n${footerText}` : ''}`;
    const replyMarkup = searchHistoryId
      ? this.createSearchResultsKeyboard(searchHistoryId, page.items, page)
      : undefined;

    return {
      text,
      parseMode: 'HTML',
      replyMarkup,
    };
  };

  // Форматирование отдельных элементов
  public formatMenuItem = (searchResultItem: TSearchResultItem): TFormattedMessage => {
    const text = this.formatMenuItemText(searchResultItem);
    const replyMarkup = this.createOrderKeyboard(searchResultItem.id, searchResultItem.orderUrl);

    return {
      text,
      parseMode: 'HTML',
      replyMarkup,
      photo: searchResultItem.image || undefined,
    };
  };

  public formatRestaurantCard = (restaurant: TRestaurant, items: TMenuItem[]): TFormattedMessage => {
    const text = this.formatRestaurantCardText(restaurant, items);

    return {
      text,
      parseMode: 'HTML',
    };
  };

  // Форматирование системных сообщений
  public formatWelcomeMessage = (userName?: string, city?: string): TFormattedMessage => {
    const greeting = userName ? `Привет, ${userName}! 👋` : 'Привет! 👋';

    const text = `${greeting}

🍽️ <b>Food Talker</b> - ваш умный помощник для поиска еды!

🔍 <b>Как использовать:</b>
• Просто напишите, что хотите съесть
• Например: "хочу пиццу с грибами", "бургер с картошкой", "суши с лососем"

📍 <b>Доступные города:</b>
${Object.values(EAvailableCities).map(city => `• ${city}`).join('\n')}

📍 <b>Выбранный город:</b>
${city ? this.escapeHtml(city) : 'Не выбран'}

💡 <b>Команды:</b>
/help - справка
/address - изменить город
/history - история поиска
/support - связаться с поддержкой
/stats - статистика поиска

Начните поиск прямо сейчас! 🚀`;

    return { text, parseMode: 'HTML' };
  };

  public formatHelpMessage = (): TFormattedMessage => {
    const text = `📚 <b>Справка по использованию бота</b>

🔍 <b>Поиск еды:</b>
Просто напишите, что хотите съесть на естественном языке:
• "хочу пиццу с грибами"
• "бургер с картошкой и колой"
• "суши с лососем и васаби"
• "вегетарианский салат"
• "десерт с шоколадом"

📍 <b>Геолокация:</b>
• Бот покажет только блюда, доступные в вашем городе
• Используйте /address для смены города

💰 <b>Цены:</b>
• Все цены указаны в рублях

📱 <b>Заказ:</b>
• Нажмите "Заказать" для перехода к ресторану

📋 <b>Команды:</b>
/start - главное меню
/help - эта справка
/address - изменить город доставки
/history - история поиска
/support - связаться с поддержкой
/stats - статистика поиска

💡 <b>Советы:</b>
• Чем подробнее опишете желаемое, тем точнее будут результаты
• Можно указать предпочтения: "без мяса", "острое", "сладкое"
• Используйте кнопки навигации для просмотра результатов
• Используйте "История" для повторения поиска
• Присоединяйтесь к нашему сообществу в Telegram: @foodtalker_group`;

    return { text, parseMode: 'HTML' };
  };

  public formatErrorMessage = (error: AppError): TFormattedMessage => {
    let userMessage: string;

    if (error.isUserFacing) {
      userMessage = error.message;
    } else {
      userMessage = 'Произошла ошибка при обработке запроса. Попробуйте еще раз.';
    }

    const text = `❌ <b>Ошибка</b>

${userMessage}

🔧 <b>Что можно сделать:</b>
• Проверьте правильность запроса
• Попробуйте переформулировать поиск
• Обратитесь в поддержку, если проблема повторяется`;

    const replyMarkup = {
      inline_keyboard: [
        [this.keyboardRemoveMessage()],
      ],
    };

    return {
      text,
      parseMode: 'HTML',
      replyMarkup,
    };
  };

  public formatNoResultsMessage = (query?: string): TFormattedMessage => {
    const queryText = query ? `по запросу "<i>${this.escapeHtml(query)}</i>"` : '';

    const text = `🔍 <b>Результаты не найдены</b> ${queryText}

😔 К сожалению, мы не смогли найти подходящие блюда.

💡 <b>Попробуйте:</b>
• Изменить формулировку запроса
• Упростить поиск (например, "пицца" вместо "пицца с грибами и моцареллой")
• Проверить, доступна ли доставка в вашем городе
• Использовать другие ключевые слова

🔄 <b>Примеры запросов:</b>
• "бургер"
• "пицца"
• "суши"
• "салат"
• "напитки"`;

    return { text, parseMode: 'HTML' };
  };

  public formatHistoryMessage = (history: TSearchHistoryItem[]): TFormattedMessage => {
    if (history.length === 0) {
      const text = `📋 <b>История поиска</b>

У вас пока нет истории поиска.

🔍 Начните поиск, чтобы увидеть здесь ваши запросы!`;

      return { text, parseMode: 'HTML' };
    }

    const itemsText = history.slice(0, 5).map((item, index) => {
      const date = new Date(item.timestamp).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const resultsCount = item.results?.length || 0;
      const resultsText = resultsCount === 0
        ? 'нет результатов'
        : resultsCount === 1
          ? '1 результат'
          : resultsCount < 5
            ? `${resultsCount} результата`
            : `${resultsCount} результатов`;
      return `${index + 1}. <b>${this.escapeHtml(item.query)}</b> (${date}) - ${resultsText}`;
    }).join('\n');

    const text = `📋 <b>История поиска</b>

Последние ${Math.min(history.length, 5)} запросов:

${itemsText}

💡 Нажмите на любой запрос, чтобы повторить поиск`;

    const replyMarkup = this.createHistoryKeyboard(history.slice(0, 5));

    return {
      text,
      parseMode: 'HTML',
      replyMarkup,
    };
  };

  public formatAdminError = (error: AppError, context?: Record<string, unknown>): TFormattedMessage => {
    const text = this.formatAdminErrorMessage(error, context);
    const replyMarkup = {
      inline_keyboard: [
        [this.keyboardRemoveMessage()],
      ],
    };
    return {
      text,
      parseMode: 'HTML' as const,
      replyMarkup,
    };
  };

  public formatAdminSystemError = (error: Error, context?: Record<string, unknown>): TFormattedMessage => {
    const text = this.formatAdminSystemErrorMessage(error, context);
    const replyMarkup = {
      inline_keyboard: [
        [this.keyboardRemoveMessage()],
      ],
    };
    return {
      text,
      parseMode: 'HTML' as const,
      replyMarkup,
    };
  };

  // Создание inline клавиатур
  public createOrderKeyboard = (itemId: string, orderUrl: string): TInlineKeyboardMarkup => {
    return {
      inline_keyboard: [
        [
          {
            text: '🛒 Заказать',
            url: orderUrl,
          },
        ],
        [
          this.keyboardRemoveMessage(),
        ],
      ],
    };
  };

  public createPaginationKeyboard = (page: TSearchResultsPage, searchHistoryId?: string): TInlineKeyboardMarkup => {
    const buttons: InlineKeyboardButton[][] = [];

    // Кнопки навигации
    const navButtons: InlineKeyboardButton[] = [];

    if (page.currentPage > 1) {
      navButtons.push({
        text: '◀️ Назад',
        callback_data: `page:${searchHistoryId}:${page.currentPage - 1}`,
      });
    }

    if (page.currentPage < page.totalPages) {
      navButtons.push({
        text: 'Вперед ▶️',
        callback_data: `page:${searchHistoryId}:${page.currentPage + 1}`,
      });
    }

    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    return { inline_keyboard: buttons };
  };

  public createSearchResultsKeyboard = (
    searchHistoryId: string,
    results: TSearchResultItem[],
    page: TSearchResultsPage,
  ): TInlineKeyboardMarkup => {
    const buttons: InlineKeyboardButton[][] = [];

    // Кнопки для каждого результата
    const startIndex = (page.currentPage - 1) * this.paginationConfig.itemsPerPage;
    results.forEach((item, index) => {
      buttons.push([
        {
          text: `${startIndex + index + 1}. ${this.truncateText(item.name, 30)}`,
          callback_data: `item:${searchHistoryId}:${item.id}`,
        },
      ]);
    });

    const paginationButtons = this.createPaginationKeyboard(
      page,
      searchHistoryId,
    ).inline_keyboard[0];

    if (paginationButtons) {
      buttons.push(paginationButtons);
    }

    return { inline_keyboard: buttons };
  };

  public createHistoryKeyboard = (history: TSearchHistoryItem[]): TInlineKeyboardMarkup => {
    const buttons: InlineKeyboardButton[][] = [];

    history.forEach((item, index) => {
      buttons.push([
        {
          text: `${index + 1}. ${this.truncateText(item.query, 30)}`,
          callback_data: `history:${item.id}`,
        },
      ]);
    });

    return { inline_keyboard: buttons };
  };

  // Утилиты
  public paginateResults = (
    results: TSearchResultItem[], page: number, itemsPerPage: number): TSearchResultsPage => {
    const totalItems = results.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const currentPage = Math.max(1, Math.min(page, totalPages));

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const items = results.slice(startIndex, endIndex);

    return {
      items,
      currentPage,
      totalPages,
      totalItems,
    };
  };

  public truncateText = (text: string, maxLength: number): string => {
    text = text.trim();
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - 3) + '...';
  };

  public formatPrice = (price: number): string => {
    return `${price} ₽`;
  };

  public formatIngredients = (ingredients: string[]): string => {
    if (!ingredients || ingredients.length === 0) {
      return 'Состав не указан';
    }

    const formattedIngredients = ingredients
      .map(ingredient => `• ${ingredient}`)
      .join('\n');

    return this.truncateText(formattedIngredients, this.formattingConfig.maxIngredientsLength);
  };

  public keyboardRemoveMessage = (): InlineKeyboardButton => {
    return {
      text: '🗑️ Скрыть',
      callback_data: `delete_message`,
    };
  };

  // Приватные методы форматирования
  private formatAdminErrorMessage = (error: AppError, context?: Record<string, unknown>): string => {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `\n<b>Контекст:</b> <code>${JSON.stringify(context, null, 2)}</code>` : '';

    return `🚨 <b>Критическая ошибка</b>

<b>Тип:</b> ${error.type}
<b>Код:</b> ${error.code}
<b>Сообщение:</b> ${error.message}
<b>Время:</b> ${timestamp}${contextStr}

<b>Стек:</b>
<code>${error.stack || 'Недоступен'}</code>`;
  };

  private formatAdminSystemErrorMessage = (error: Error, context?: Record<string, unknown>): string => {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `\n<b>Контекст:</b> <code>${JSON.stringify(context, null, 2)}</code>` : '';

    return `⚠️ <b>Системная ошибка</b>

<b>Сообщение:</b> ${error.message}
<b>Время:</b> ${timestamp}${contextStr}

<b>Стек:</b>
<code>${error.stack || 'Недоступен'}</code>`;
  };

  private formatSearchResultItem = (item: TSearchResultItem, index: number): string => {
    // const image = item.image;
    const description = this.truncateText(item.description, this.formattingConfig.maxDescriptionLength);
    const tags = item.tags.join(', ');

    return `${index}. <b><a href="${item.orderUrl}" target="_blank">${this.escapeHtml(item.name)}</a></b>
🏪 <i>${this.escapeHtml(item.restaurant.name)}</i>
💰 <b>${this.formatPrice(item.price)}</b>
${description
  ? `
📝 ${this.escapeHtml(description)}`
  : ''}${!description && tags
  ? `
📝 ${tags}`
  : ''}`.trim();
  };

  private formatMenuItemText = (item: TSearchResultItem): string => {
    const description = this.truncateText(item.description, this.formattingConfig.maxDescriptionLength);
    const tags = item.tags.join(', ');

    return `🍽️ <b>${this.escapeHtml(item.name)}</b>
🏪 <i>${this.escapeHtml(item.restaurant.name)}</i>
💰 <b>${this.formatPrice(item.price)}</b>
${description
  ? `
📝 ${this.escapeHtml(description)}`
  : ''}${!description && tags
  ? `
📝 ${tags}`
  : ''}`.trim();
  };

  private formatRestaurantCardText = (restaurant: TRestaurant, items: TMenuItem[]): string => {
    const totalItems = items.length;
    const avgPrice = items.length > 0
      ? Math.round(items.reduce((sum, item) => sum + item.price, 0) / items.length)
      : 0;

    return `🏪 <b>${this.escapeHtml(restaurant.name)}</b>

📊 <b>Информация:</b>
• Блюд в меню: ${totalItems}
• Средняя цена: ${this.formatPrice(avgPrice)}
• Последнее обновление: ${restaurant.lastUpdated.toLocaleDateString('ru-RU')}`;
  };

  private formatSearchResultsHeader = (page: TSearchResultsPage): string => {
    return `🔍 <b>Результаты поиска</b>

Найдено: <b>${page.totalItems}</b> блюд
Страница: <b>${page.currentPage}</b> из <b>${page.totalPages}</b>`;
  };

  private formatSearchResultsFooter = (page: TSearchResultsPage): string => {
    if (page.totalPages > 1) {
      return `💡 Используйте кнопки ниже для навигации.`;
    }

    return `✅ Показаны все доступные результаты.`;
  };

  private escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
}
