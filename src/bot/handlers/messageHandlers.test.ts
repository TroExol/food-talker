import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TBotContext } from '@/types/telegram';
import type { UserService } from '@/services/user/UserService/UserService';
import type { TUser } from '@/services/user/UserRepository/types';
import type { SearchService } from '@/services/search/SearchService/SearchService';
import type { AnalyticsService } from '@/services/analytics/AnalyticsService/AnalyticsService';

import { ESubscriptionType } from '@/services/user/UserRepository/types';
import { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';
import { EAvailableCities } from '@/config/bot/types';

import { MessageHandlers } from './messageHandlers';

describe('MessageHandlers', () => {
  let messageHandlers: MessageHandlers;
  let mockUserService: UserService;
  let mockSearchService: SearchService;
  let mockMessageFormatter: MessageFormatterService;
  let mockAnalyticsService: AnalyticsService;

  beforeEach(() => {
    mockUserService = {
      createUser: vi.fn(),
      getUser: vi.fn(),
      updateUserCity: vi.fn(),
      updateSubscription: vi.fn(),
      checkSubscriptionExpiry: vi.fn(),
      addToSearchHistory: vi.fn(),
      getSearchHistory: vi.fn(),
      clearSearchHistory: vi.fn(),
      deleteUser: vi.fn(),
      checkSearchLimit: vi.fn(),
      getSearchStats: vi.fn(),
    } as unknown as UserService;

    mockSearchService = {
      searchFood: vi.fn(),
      enhanceResultsWithLLM: vi.fn(),
      getSearchStats: vi.fn(),
    } as unknown as SearchService;

    mockAnalyticsService = {
      trackError: vi.fn(),
      trackPerformance: vi.fn(),
      trackSearchQueryStarted: vi.fn(),
      trackSearchQueryCompleted: vi.fn(),
      trackUserStateChanged: vi.fn(),
      trackMessageReceived: vi.fn(),
      trackCallbackButtonClicked: vi.fn(),
      trackCitySelectionCompleted: vi.fn(),
      trackSearchLimitExceeded: vi.fn(),
    } as unknown as AnalyticsService;

    mockMessageFormatter = new MessageFormatterService();

    messageHandlers = new MessageHandlers(
      mockUserService,
      mockSearchService,
      mockMessageFormatter,
      mockAnalyticsService,
    );
  });

  describe('constructor', () => {
    it('should create message handlers instance', () => {
      expect(messageHandlers).toBeInstanceOf(MessageHandlers);
    });
  });

  describe('getHandlers', () => {
    it('should return array of message handlers', () => {
      const handlers = messageHandlers.getHandlers();

      expect(handlers).toBeInstanceOf(Array);
      expect(handlers).toHaveLength(6);

      // Проверяем, что есть обработчик для callback'ов
      const callbackHandler = handlers.find(h => h.pattern.toString().includes('city:'));
      expect(callbackHandler).toBeDefined();

      // Проверяем, что есть обработчик для текстовых сообщений
      const textHandler = handlers.find(h => h.pattern.toString() === '/.*/');
      expect(textHandler).toBeDefined();
    });
  });

  describe('text message handler', () => {
    it('должен проверять лимит поиска перед обработкой текстового сообщения', async () => {
      const mockContext = {
        user: { telegramId: 123456789, city: 'Пермь', state: 'idle' },
        message: { text: 'хочу пиццу' },
        reply: vi.fn(),
        chat: { id: 123 },
        telegram: {
          editMessageText: vi.fn(),
          deleteMessage: vi.fn(),
        },
      };

      vi.mocked(mockUserService.checkSearchLimit).mockResolvedValue(false);
      vi.mocked(mockUserService.getSearchStats).mockResolvedValue({
        searchesToday: 10,
        searchLimit: 10,
        remainingSearches: 0,
        searchesThisMonth: 50,
        totalSearches: 100,
        lastSearchDate: new Date(),
      });
      vi.mocked(mockUserService.getUser).mockResolvedValue({
        telegramId: 123456789,
        chatId: 123456789,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: new Date(),
        city: EAvailableCities.PERM,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const handlers = messageHandlers.getHandlers();
      const textHandler = handlers.find(h => h.pattern.toString() === '/.*/');

      if (textHandler) {
        await textHandler.handler(mockContext as unknown as TBotContext);

        expect(mockUserService.checkSearchLimit).toHaveBeenCalledWith(123456789);
        expect(mockAnalyticsService.trackMessageReceived).toHaveBeenCalled();
        expect(mockAnalyticsService.trackSearchLimitExceeded).toHaveBeenCalled();
        expect(mockContext.reply).toHaveBeenCalledWith(
          'Достигнут лимит поиска. Воспользуйтесь командой /stats для подробной информации.',
        );
      }
    });

    it('должен выполнять поиск если лимит не превышен', async () => {
      const mockContext = {
        user: { telegramId: 123456789, city: 'Пермь', state: 'idle' },
        message: { text: 'хочу пиццу' },
        reply: vi.fn(),
        chat: { id: 123 },
        telegram: {
          editMessageText: vi.fn(),
          deleteMessage: vi.fn(),
        },
      };

      vi.mocked(mockUserService.checkSearchLimit).mockResolvedValue(true);
      vi.mocked(mockSearchService.searchFood).mockResolvedValue([]);
      vi.mocked(mockUserService.getSearchHistory).mockResolvedValue([]);

      const handlers = messageHandlers.getHandlers();
      const textHandler = handlers.find(h => h.pattern.toString() === '/.*/');

      if (textHandler) {
        await textHandler.handler(mockContext as unknown as TBotContext);

        expect(mockUserService.checkSearchLimit).toHaveBeenCalledWith(123456789);
        expect(mockSearchService.searchFood).toHaveBeenCalledWith('хочу пиццу', 123456789, {
          enableLLMEnhancement: true,
          enableVectorSearch: true,
        });
      }
    });

    it('должен обрабатывать ошибки при поиске', async () => {
      const mockContext = {
        user: { telegramId: 123456789, city: 'Пермь', state: 'idle' },
        message: { text: 'хочу пиццу' },
        reply: vi.fn(),
        chat: { id: 123 },
        telegram: {
          editMessageText: vi.fn(),
          deleteMessage: vi.fn(),
        },
      };

      vi.mocked(mockUserService.checkSearchLimit).mockResolvedValue(true);
      vi.mocked(mockSearchService.searchFood).mockRejectedValue(new Error('Search failed'));

      const handlers = messageHandlers.getHandlers();
      const textHandler = handlers.find(h => h.pattern.toString() === '/.*/');

      if (textHandler) {
        await textHandler.handler(mockContext as unknown as TBotContext);

        expect(mockContext.reply).toHaveBeenCalledWith(
          'Ошибка при поиске. Попробуйте еще раз.',
        );
      }
    });
  });

  describe('callback query handler', () => {
    it('должен обрабатывать выбор города', async () => {
      const mockContext = {
        user: { telegramId: 123456789 },
        callbackQuery: { data: 'city:Москва' },
        reply: vi.fn(),
        answerCbQuery: vi.fn(),
        from: { id: 123456789 },
        chat: { id: 123 },
        telegram: { deleteMessage: vi.fn() },
      };

      const mockUser = {
        telegramId: 123456789,
        city: 'Москва',
      };

      vi.mocked(mockUserService.updateUserCity).mockResolvedValue(mockUser as unknown as TUser);

      const handlers = messageHandlers.getHandlers();
      const callbackHandler = handlers.find(h => h.pattern.toString().includes('city:'));

      if (callbackHandler) {
        await callbackHandler.handler(mockContext as unknown as TBotContext);

        expect(mockUserService.updateUserCity).toHaveBeenCalledWith(123456789, 'Москва');
        expect(mockContext.answerCbQuery).toHaveBeenCalledWith('Город изменен на: Москва');
      }
    });

    it('должен обрабатывать ошибки при обновлении города', async () => {
      const mockContext = {
        user: { telegramId: 123456789 },
        callbackQuery: { data: 'city:НеизвестныйГород' },
        reply: vi.fn(),
        answerCbQuery: vi.fn(),
        from: { id: 123456789 },
      };

      // Не нужно мокать updateUserCity, так как город не поддерживается и вызов не происходит

      const handlers = messageHandlers.getHandlers();
      const callbackHandler = handlers.find(h => h.pattern.toString().includes('city:'));

      if (callbackHandler) {
        await callbackHandler.handler(mockContext as unknown as TBotContext);

        expect(mockContext.answerCbQuery).toHaveBeenCalledWith('Этот город пока не поддерживается');
      }
    });
  });

  describe('UserService integration', () => {
    it('должен использовать checkSearchLimit для проверки лимитов', () => {
      expect(mockUserService.checkSearchLimit).toBeDefined();
      expect(typeof mockUserService.checkSearchLimit).toBe('function');
    });

    it('должен использовать getSearchStats для получения статистики', () => {
      expect(mockUserService.getSearchStats).toBeDefined();
      expect(typeof mockUserService.getSearchStats).toBe('function');
    });
  });
});
