import type { InlineKeyboardButton } from 'telegraf/types';

import type { AppError } from '@/utils/AppError';
import type { TInlineKeyboardMarkup } from '@/types/telegram';
import type { TSearchResultItem } from '@/types/search';
import type { TRestaurant } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';

import type {
  TFormattedMessage,
  TFormattingConfig,
  TPaginationConfig,
  TSearchResultsPage,
} from './types';

export class MessageFormatterService {
  private readonly paginationConfig: TPaginationConfig = {
    itemsPerPage: 5, // Максимум 5 результатов на страницу
    maxPages: 4, // Максимум 4 страницы (20 результатов)
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
  formatSearchResults(results: TSearchResultItem[], page = 1): TFormattedMessage {
    const paginatedResults = this.paginateResults(results, page, this.paginationConfig.itemsPerPage);
    return this.formatSearchResultsPage(paginatedResults);
  }

  formatSearchResultsPage(page: TSearchResultsPage): TFormattedMessage {
    if (page.items.length === 0) {
      return this.formatNoResultsMessage();
    }

    const itemsText = page.items.map((item, index) =>
      this.formatSearchResultItem(item, index + 1),
    ).join('\n\n');

    const headerText = this.formatSearchResultsHeader(page);
    const footerText = this.formatSearchResultsFooter(page);

    const text = `${headerText}\n\n${itemsText}\n\n${footerText}`;
    const replyMarkup = this.createSearchResultsKeyboard(page.items, page.currentPage);

    return {
      text,
      parseMode: 'HTML',
      replyMarkup,
    };
  }

  // Форматирование отдельных элементов
  formatMenuItem(item: TMenuItem): TFormattedMessage {
    const text = this.formatMenuItemText(item);
    const replyMarkup = this.createOrderKeyboard(item.id, item.orderUrl);

    return {
      text,
      parseMode: 'HTML',
      replyMarkup,
    };
  }

  formatRestaurantCard(restaurant: TRestaurant, items: TMenuItem[]): TFormattedMessage {
    const text = this.formatRestaurantCardText(restaurant, items);

    return {
      text,
      parseMode: 'HTML',
    };
  }

  // Форматирование системных сообщений
  formatWelcomeMessage(userName?: string): TFormattedMessage {
    const greeting = userName ? `Привет, ${userName}! 👋` : 'Привет! 👋';

    const text = `${greeting}

🍽️ <b>Food Talker</b> - ваш умный помощник для поиска еды!

🔍 <b>Как использовать:</b>
• Просто напишите, что хотите съесть
• Например: "хочу пиццу с грибами", "бургер с картошкой", "суши с лососем"

📍 <b>Доступные города:</b>
• Пермь
• Воронеж

💡 <b>Команды:</b>
/help - справка
/address - изменить город
/history - история поиска
/cancel - отменить действие

Начните поиск прямо сейчас! 🚀`;

    return { text, parseMode: 'HTML' };
  }

  formatHelpMessage(): TFormattedMessage {
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
• Учитывается минимальная сумма заказа

📱 <b>Заказ:</b>
• Нажмите "Заказать" для перехода к агрегатору
• Бот предоставит прямую ссылку на заказ

📋 <b>Команды:</b>
/start - главное меню
/help - эта справка
/address - изменить город доставки
/history - история поиска
/cancel - отменить текущее действие

💡 <b>Советы:</b>
• Чем подробнее опишете желаемое, тем точнее будут результаты
• Можно указать предпочтения: "без мяса", "острое", "сладкое"
• Используйте "Показать еще" для дополнительных результатов`;

    return { text, parseMode: 'HTML' };
  }

  formatErrorMessage(error: AppError): TFormattedMessage {
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
• Используйте /cancel для сброса
• Обратитесь в поддержку, если проблема повторяется`;

    return { text, parseMode: 'HTML' };
  }

  formatNoResultsMessage(query?: string): TFormattedMessage {
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
  }

  formatHistoryMessage(history: TSearchResultItem[]): TFormattedMessage {
    if (history.length === 0) {
      const text = `📋 <b>История поиска</b>

У вас пока нет истории поиска.

🔍 Начните поиск, чтобы увидеть здесь ваши запросы!`;

      return { text, parseMode: 'HTML' };
    }

    const itemsText = history.slice(0, 5).map((item, index) =>
      `${index + 1}. <b>${this.escapeHtml(item.name)}</b> - ${this.formatPrice(item.price)}`,
    ).join('\n');

    const text = `📋 <b>История поиска</b>

Последние ${Math.min(history.length, 5)} запросов:

${itemsText}

💡 Нажмите на любой результат, чтобы повторить поиск`;

    const replyMarkup = this.createHistoryKeyboard(history.slice(0, 5));

    return {
      text,
      parseMode: 'HTML',
      replyMarkup,
    };
  }

  // Создание inline клавиатур
  createOrderKeyboard(itemId: string, orderUrl: string): TInlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '🛒 Заказать',
            url: orderUrl,
          },
        ],
        [
          {
            text: '🔍 Похожие блюда',
            callback_data: `similar:${itemId}`,
          },
        ],
      ],
    };
  }

  createPaginationKeyboard(currentPage: number, totalPages: number, hasMore: boolean): TInlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = [];

    // Кнопки навигации
    const navButtons: InlineKeyboardButton[] = [];

    if (currentPage > 1) {
      navButtons.push({
        text: '◀️ Назад',
        callback_data: `page:${currentPage - 1}`,
      });
    }

    navButtons.push({
      text: `${currentPage}/${totalPages}`,
      callback_data: 'page_info',
    });

    if (hasMore) {
      navButtons.push({
        text: 'Вперед ▶️',
        callback_data: `page:${currentPage + 1}`,
      });
    }

    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    // Кнопка "Показать еще" если есть дополнительные результаты
    if (hasMore) {
      buttons.push([
        {
          text: '📄 Показать еще',
          callback_data: `show_more:${currentPage}`,
        },
      ]);
    }

    return { inline_keyboard: buttons };
  }

  createSearchResultsKeyboard(results: TSearchResultItem[], currentPage: number): TInlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = [];

    // Кнопки для каждого результата
    results.forEach((item, index) => {
      buttons.push([
        {
          text: `${index + 1}. ${this.truncateText(item.name, 30)}`,
          callback_data: `item:${item.id}`,
        },
      ]);
    });

    // Кнопки навигации
    if (results.length >= this.paginationConfig.itemsPerPage) {
      buttons.push([
        {
          text: '📄 Показать еще',
          callback_data: `show_more:${currentPage}`,
        },
      ]);
    }

    return { inline_keyboard: buttons };
  }

  createHistoryKeyboard(history: TSearchResultItem[]): TInlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = [];

    history.forEach((item, index) => {
      buttons.push([
        {
          text: `${index + 1}. ${this.truncateText(item.name, 30)}`,
          callback_data: `history:${item.id}`,
        },
      ]);
    });

    return { inline_keyboard: buttons };
  }

  // Утилиты
  paginateResults(results: TSearchResultItem[], page: number, itemsPerPage: number): TSearchResultsPage {
    const totalItems = results.length;
    const totalPages = Math.min(
      Math.ceil(totalItems / itemsPerPage),
      this.paginationConfig.maxPages,
    );
    const currentPage = Math.max(1, Math.min(page, totalPages));

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const items = results.slice(startIndex, endIndex);

    const hasMore = endIndex < totalItems && currentPage < this.paginationConfig.maxPages;

    return {
      items,
      currentPage,
      totalPages,
      totalItems,
      hasMore,
    };
  }

  truncateText(text: string, maxLength: number): string {
    text = text.trim();
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - 3) + '...';
  }

  formatPrice(price: number): string {
    return `${price} ₽`;
  }

  formatIngredients(ingredients: string[]): string {
    if (!ingredients || ingredients.length === 0) {
      return 'Состав не указан';
    }

    const formattedIngredients = ingredients
      .map(ingredient => `• ${ingredient}`)
      .join('\n');

    return this.truncateText(formattedIngredients, this.formattingConfig.maxIngredientsLength);
  }

  // Приватные методы форматирования
  private formatSearchResultItem(item: TSearchResultItem, index: number): string {
    // const image = item.image;
    const description = this.truncateText(item.description, this.formattingConfig.maxDescriptionLength);

    return `${index}. <b><a href="${item.orderUrl}" target="_blank">${this.escapeHtml(item.name)}</a></b>
🏪 <i>${this.escapeHtml(item.restaurant.name)}</i>
💰 <b>${this.formatPrice(item.price)}</b>
${description
  ? `
📝 ${this.escapeHtml(description)}`
  : ''}${item.tags.length > 0
  ? `
📝 ${item.tags.join(', ')}`
  : ''}`;
  }

  private formatMenuItemText(item: TMenuItem): string {
    // const image = item.image;
    const description = this.truncateText(item.description, this.formattingConfig.maxDescriptionLength);

    return `🍽️ <b>${this.escapeHtml(item.name)}</b>
🏪 <i>${this.escapeHtml(item.restaurant.name)}</i>
💰 <b>${this.formatPrice(item.price)}</b>

📝 ${this.escapeHtml(description)}

${item.available ? '✅ Доступно' : '❌ Недоступно'}`;
  }

  private formatRestaurantCardText(restaurant: TRestaurant, items: TMenuItem[]): string {
    const totalItems = items.length;
    const avgPrice = items.length > 0
      ? Math.round(items.reduce((sum, item) => sum + item.price, 0) / items.length)
      : 0;

    return `🏪 <b>${this.escapeHtml(restaurant.name)}</b>

📊 <b>Информация:</b>
• Блюд в меню: ${totalItems}
• Средняя цена: ${this.formatPrice(avgPrice)}
• Последнее обновление: ${restaurant.lastUpdated.toLocaleDateString('ru-RU')}`;
  }

  private formatSearchResultsHeader(page: TSearchResultsPage): string {
    return `🔍 <b>Результаты поиска</b>

Найдено: <b>${page.totalItems}</b> блюд
Страница: <b>${page.currentPage}</b> из <b>${page.totalPages}</b>`;
  }

  private formatSearchResultsFooter(page: TSearchResultsPage): string {
    if (page.hasMore) {
      return `💡 Используйте кнопки ниже для навигации или нажмите "Показать еще" для дополнительных результатов.`;
    }

    return `✅ Показаны все доступные результаты.`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
