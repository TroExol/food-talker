import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import type { TSearchResultItem } from '../../../types/search';
import type { TRestaurant } from '../../../types/restaurant';
import type { TMenuItem } from '../../../types/menuItem';

import { MessageFormatterService } from './MessageFormatter';
import { AppError } from '../../../utils/AppError';
import { EDishCategory } from '../../../types/menuItem';

describe('MessageFormatterService', () => {
  let messageFormatter: MessageFormatterService;
  let mockRestaurant: TRestaurant;
  let mockMenuItem: TMenuItem;
  let mockSearchResult: TSearchResultItem;

  beforeEach(() => {
    messageFormatter = new MessageFormatterService();

    mockRestaurant = {
      id: 'restaurant-1',
      name: 'Тестовый ресторан',
      coordinates: {
        latitude: 58.0105,
        longitude: 56.2502,
      },
      lastUpdated: new Date('2024-01-01'),
    };

    mockMenuItem = {
      id: 'item-1',
      name: 'Тестовое блюдо',
      description: 'Очень вкусное тестовое блюдо с ингредиентами',
      ingredients: ['ингредиент 1', 'ингредиент 2', 'ингредиент 3'],
      price: 500,
      image: 'https://example.com/image.jpg',
      available: true,
      restaurant: mockRestaurant,
      orderUrl: 'https://example.com/order',
      category: EDishCategory.MAIN,
    };

    mockSearchResult = {
      id: 'search-1',
      name: 'Тестовый результат поиска',
      restaurant: {
        id: 'restaurant-1',
        name: 'Тестовый ресторан',
      },
      description: 'Описание тестового результата поиска',
      tags: ['тег1', 'тег2'],
      price: 750,
      image: 'https://example.com/search-image.jpg',
      orderUrl: 'https://example.com/search-order',
      category: EDishCategory.MAIN,
    };
  });

  describe('formatWelcomeMessage', () => {
    it('должен форматировать приветственное сообщение без имени пользователя', () => {
      const result = messageFormatter.formatWelcomeMessage();

      expect(result.text).toContain('Привет! 👋');
      expect(result.text).toContain('Food Talker');
      expect(result.text).toContain('Как использовать');
      expect(result.parseMode).toBe('HTML');
    });

    it('должен форматировать приветственное сообщение с именем пользователя', () => {
      const result = messageFormatter.formatWelcomeMessage('Иван');

      expect(result.text).toContain('Привет, Иван! 👋');
      expect(result.text).toContain('Food Talker');
    });
  });

  describe('formatHelpMessage', () => {
    it('должен форматировать справочное сообщение', () => {
      const result = messageFormatter.formatHelpMessage();

      expect(result.text).toContain('Справка по использованию бота');
      expect(result.text).toContain('Поиск еды');
      expect(result.text).toContain('Геолокация');
      expect(result.text).toContain('Команды');
      expect(result.parseMode).toBe('HTML');
    });
  });

  describe('formatErrorMessage', () => {
    it('должен форматировать пользовательскую ошибку', () => {
      const error = AppError.validationError('Неверный формат запроса');
      const result = messageFormatter.formatErrorMessage(error);

      expect(result.text).toContain('Ошибка');
      expect(result.text).toContain('Неверный формат запроса');
      expect(result.parseMode).toBe('HTML');
    });

    it('должен форматировать системную ошибку с общим сообщением', () => {
      const error = AppError.systemError('Внутренняя ошибка системы');
      const result = messageFormatter.formatErrorMessage(error);

      expect(result.text).toContain('Ошибка');
      expect(result.text).toContain('Произошла ошибка при обработке запроса');
      expect(result.text).not.toContain('Внутренняя ошибка системы');
    });
  });

  describe('formatNoResultsMessage', () => {
    it('должен форматировать сообщение об отсутствии результатов без запроса', () => {
      const result = messageFormatter.formatNoResultsMessage();

      expect(result.text).toContain('Результаты не найдены');
      expect(result.text).toContain('Попробуйте');
      expect(result.text).toContain('Примеры запросов');
      expect(result.parseMode).toBe('HTML');
    });

    it('должен форматировать сообщение об отсутствии результатов с запросом', () => {
      const result = messageFormatter.formatNoResultsMessage('пицца с ананасами');

      expect(result.text).toContain('Результаты не найдены');
      expect(result.text).toContain('пицца с ананасами');
    });
  });

  describe('formatMenuItem', () => {
    it('должен форматировать элемент меню', () => {
      const result = messageFormatter.formatMenuItem(mockMenuItem);

      expect(result.text).toContain('Тестовое блюдо');
      expect(result.text).toContain('Тестовый ресторан');
      expect(result.text).toContain('500 ₽');
      expect(result.text).toContain('Очень вкусное тестовое блюдо');
      expect(result.text).toContain('✅ Доступно');
      expect(result.parseMode).toBe('HTML');
      expect(result.replyMarkup).toBeDefined();
    });

    it('должен форматировать недоступный элемент меню', () => {
      const unavailableItem = { ...mockMenuItem, available: false };
      const result = messageFormatter.formatMenuItem(unavailableItem);

      expect(result.text).toContain('❌ Недоступно');
    });
  });

  describe('formatSearchResults', () => {
    it('должен форматировать результаты поиска', () => {
      const results = [mockSearchResult];
      const result = messageFormatter.formatSearchResults(results);

      expect(result.text).toContain('Результаты поиска');
      expect(result.text).toContain('Тестовый результат поиска');
      expect(result.text).toContain('750 ₽');
      expect(result.parseMode).toBe('HTML');
      expect(result.replyMarkup).toBeDefined();
    });

    it('должен возвращать сообщение об отсутствии результатов для пустого массива', () => {
      const result = messageFormatter.formatSearchResults([]);

      expect(result.text).toContain('Результаты не найдены');
    });
  });

  describe('paginateResults', () => {
    it('должен правильно пагинировать результаты', () => {
      const results = Array.from({ length: 15 }, (_, i) => ({
        ...mockSearchResult,
        id: `item-${i}`,
        name: `Блюдо ${i}`,
      }));

      const page = messageFormatter.paginateResults(results, 1, 5);

      expect(page.items).toHaveLength(5);
      expect(page.currentPage).toBe(1);
      expect(page.totalPages).toBe(3);
      expect(page.totalItems).toBe(15);
      expect(page.hasMore).toBe(true);
    });

    it('должен обрабатывать последнюю страницу', () => {
      const results = Array.from({ length: 15 }, (_, i) => ({
        ...mockSearchResult,
        id: `item-${i}`,
        name: `Блюдо ${i}`,
      }));

      const page = messageFormatter.paginateResults(results, 3, 5);

      expect(page.currentPage).toBe(3);
      expect(page.hasMore).toBe(false);
    });

    it('должен ограничивать максимальное количество страниц', () => {
      const results = Array.from({ length: 100 }, (_, i) => ({
        ...mockSearchResult,
        id: `item-${i}`,
        name: `Блюдо ${i}`,
      }));

      const page = messageFormatter.paginateResults(results, 1, 5);

      expect(page.totalPages).toBe(4); // Максимум 4 страницы
      expect(page.totalItems).toBe(100);
    });
  });

  describe('createOrderKeyboard', () => {
    it('должен создавать клавиатуру заказа', () => {
      const keyboard = messageFormatter.createOrderKeyboard('item-1', 'https://example.com/order');

      expect(keyboard.inline_keyboard).toHaveLength(2);
      expect(keyboard.inline_keyboard[0][0].text).toBe('🛒 Заказать');
      expect((keyboard.inline_keyboard[0][0] as any).url).toBe('https://example.com/order');
      expect(keyboard.inline_keyboard[1][0].text).toBe('🔍 Похожие блюда');
      expect((keyboard.inline_keyboard[1][0] as any).callback_data).toBe('similar:item-1');
    });
  });

  describe('createPaginationKeyboard', () => {
    it('должен создавать клавиатуру пагинации для первой страницы', () => {
      const keyboard = messageFormatter.createPaginationKeyboard(1, 3, true);

      expect(keyboard.inline_keyboard).toHaveLength(2);
      expect(keyboard.inline_keyboard[0][0].text).toBe('1/3');
      expect(keyboard.inline_keyboard[0][1].text).toBe('Вперед ▶️');
      expect(keyboard.inline_keyboard[1][0].text).toBe('📄 Показать еще');
    });

    it('должен создавать клавиатуру пагинации для средней страницы', () => {
      const keyboard = messageFormatter.createPaginationKeyboard(2, 3, true);

      expect(keyboard.inline_keyboard[0][0].text).toBe('◀️ Назад');
      expect(keyboard.inline_keyboard[0][1].text).toBe('2/3');
      expect(keyboard.inline_keyboard[0][2].text).toBe('Вперед ▶️');
    });

    it('должен создавать клавиатуру пагинации для последней страницы', () => {
      const keyboard = messageFormatter.createPaginationKeyboard(3, 3, false);

      expect(keyboard.inline_keyboard).toHaveLength(1);
      expect(keyboard.inline_keyboard[0][0].text).toBe('◀️ Назад');
      expect(keyboard.inline_keyboard[0][1].text).toBe('3/3');
    });
  });

  describe('createSearchResultsKeyboard', () => {
    it('должен создавать клавиатуру результатов поиска', () => {
      const results = [mockSearchResult];
      const keyboard = messageFormatter.createSearchResultsKeyboard(results, 1);

      expect(keyboard.inline_keyboard).toHaveLength(1);
      expect(keyboard.inline_keyboard[0][0].text).toBe('1. Тестовый результат поиска');
      expect((keyboard.inline_keyboard[0][0] as any).callback_data).toBe('item:search-1');
    });

    it('должен добавлять кнопку "Показать еще" для полной страницы', () => {
      const results = Array.from({ length: 5 }, (_, i) => ({
        ...mockSearchResult,
        id: `item-${i}`,
        name: `Блюдо ${i}`,
      }));

      const keyboard = messageFormatter.createSearchResultsKeyboard(results, 1);

      expect(keyboard.inline_keyboard).toHaveLength(6); // 5 результатов + кнопка "Показать еще"
      expect(keyboard.inline_keyboard[5][0].text).toBe('📄 Показать еще');
    });
  });

  describe('formatHistoryMessage', () => {
    it('должен форматировать историю поиска с результатами', () => {
      const history = [mockSearchResult];
      const result = messageFormatter.formatHistoryMessage(history);

      expect(result.text).toContain('История поиска');
      expect(result.text).toContain('Тестовый результат поиска');
      expect(result.text).toContain('750 ₽');
      expect(result.parseMode).toBe('HTML');
      expect(result.replyMarkup).toBeDefined();
    });

    it('должен форматировать пустую историю поиска', () => {
      const result = messageFormatter.formatHistoryMessage([]);

      expect(result.text).toContain('История поиска');
      expect(result.text).toContain('У вас пока нет истории поиска');
      expect(result.replyMarkup).toBeUndefined();
    });

    it('должен ограничивать историю до 5 элементов', () => {
      const history = Array.from({ length: 10 }, (_, i) => ({
        ...mockSearchResult,
        id: `item-${i}`,
        name: `Блюдо ${i}`,
      }));

      const result = messageFormatter.formatHistoryMessage(history);

      expect(result.text).toContain('Последние 5 запросов');
    });
  });

  describe('Утилиты', () => {
    describe('truncateText', () => {
      it('должен обрезать длинный текст', () => {
        const longText = 'Очень длинный текст, который нужно обрезать';
        const result = messageFormatter.truncateText(longText, 20);

        expect(result).toBe('Очень длинный тек...');
        expect(result.length).toBe(20);
      });

      it('должен оставлять короткий текст без изменений', () => {
        const shortText = 'Короткий текст';
        const result = messageFormatter.truncateText(shortText, 20);

        expect(result).toBe(shortText);
      });
    });

    describe('formatPrice', () => {
      it('должен форматировать цену', () => {
        const result = messageFormatter.formatPrice(1500);

        expect(result).toBe('1500 ₽');
      });
    });

    describe('formatIngredients', () => {
      it('должен форматировать список ингредиентов', () => {
        const ingredients = ['томат', 'сыр', 'базилик'];
        const result = messageFormatter.formatIngredients(ingredients);

        expect(result).toContain('• томат');
        expect(result).toContain('• сыр');
        expect(result).toContain('• базилик');
      });

      it('должен возвращать сообщение для пустого списка', () => {
        const result = messageFormatter.formatIngredients([]);

        expect(result).toBe('Состав не указан');
      });

      it('должен обрабатывать undefined', () => {
        const result = messageFormatter.formatIngredients(undefined as unknown as string[]);

        expect(result).toBe('Состав не указан');
      });
    });
  });
});
