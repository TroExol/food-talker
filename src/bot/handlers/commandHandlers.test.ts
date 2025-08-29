import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TBotContext } from '@/types/telegram';
import type { UserService } from '@/services/user/UserService/UserService';
import type { SearchService } from '@/services/search/SearchService/SearchService';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';
import type { AnalyticsService } from '@/services/analytics/AnalyticsService/AnalyticsService';

import { EBotCommand } from '@/types/telegram';

import { CommandHandlers } from './commandHandlers';

// Мокаем зависимости
const mockUserService = {
  getSearchHistory: vi.fn(),
  updateUserCity: vi.fn(),
  checkSearchLimit: vi.fn(),
  getSearchStats: vi.fn(),
  getUser: vi.fn(),
};

const mockSearchService = {
  searchFood: vi.fn(),
};

const mockMessageFormatter = {
  formatWelcomeMessage: vi.fn(),
  formatHelpMessage: vi.fn(),
  formatHistoryMessage: vi.fn(),
  formatNoResultsMessage: vi.fn(),
  formatSearchResults: vi.fn(),
};

const mockAnalyticsService = {
  trackError: vi.fn(),
  trackPerformance: vi.fn(),
  trackSearchQueryStarted: vi.fn(),
  trackSearchQueryCompleted: vi.fn(),
  trackUserStateChanged: vi.fn(),
  trackBotCommand: vi.fn(),
  trackBotCommandError: vi.fn(),
  trackSearchLimitExceeded: vi.fn(),
  trackSearchHistoryViewed: vi.fn(),
  trackUserStatsViewed: vi.fn(),
};

describe('CommandHandlers', () => {
  let commandHandlers: CommandHandlers;

  beforeEach(() => {
    commandHandlers = new CommandHandlers(
      mockUserService as unknown as UserService,
      mockSearchService as unknown as SearchService,
      mockMessageFormatter as unknown as MessageFormatterService,
      mockAnalyticsService as unknown as AnalyticsService,
    );
    vi.clearAllMocks();
  });

  describe('getHandlers', () => {
    it('должен возвращать все команды включая SEARCH', () => {
      const handlers = commandHandlers.getHandlers();

      const commands = handlers.map(h => h.command);
      expect(commands).toContain(EBotCommand.SEARCH);
      expect(commands).toContain(EBotCommand.START);
      expect(commands).toContain(EBotCommand.HELP);
      expect(commands).toContain(EBotCommand.ADDRESS);
      expect(commands).toContain(EBotCommand.HISTORY);
      expect(commands).toContain(EBotCommand.STATS);
      expect(commands).toContain(EBotCommand.SUPPORT);
    });

    it('должен иметь правильное описание для команды SEARCH', () => {
      const handlers = commandHandlers.getHandlers();
      const searchHandler = handlers.find(h => h.command === EBotCommand.SEARCH);

      expect(searchHandler).toBeDefined();
      expect(searchHandler?.description).toBe('Поиск еды по запросу');
    });

    it('должен иметь правильное описание для команды STATS', () => {
      const handlers = commandHandlers.getHandlers();
      const statsHandler = handlers.find(h => h.command === EBotCommand.STATS);

      expect(statsHandler).toBeDefined();
      expect(statsHandler?.description).toBe('Показать статистику поиска');
    });
  });

  describe('search command regex', () => {
    it('должен правильно извлекать запрос из разных вариантов команды', () => {
      const testCases = [
        { input: '/search пицца', expected: 'пицца' },
        { input: '/search@foodtalker_bot пицца', expected: 'пицца' },
        { input: '/search@foodtalker_bot  пицца с грибами', expected: 'пицца с грибами' },
        { input: '/search  пицца с грибами', expected: 'пицца с грибами' },
        { input: '/search@test_bot123 суши', expected: 'суши' },
        { input: '/search', expected: '' },
        { input: '/search@foodtalker_bot', expected: '' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = input.replace(/^\/search(?:@\w+)?\s*/, '').trim();
        expect(result).toBe(expected);
      });
    });
  });

  describe('handleSearch', () => {
    it('должен проверять лимит поиска перед выполнением', async () => {
      const mockContext = {
        user: { telegramId: 123456789, city: 'Пермь' },
        message: { text: '/search пицца' },
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
        subscription: 'basic',
        city: 'Пермь',
        state: 'idle',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const handlers = commandHandlers.getHandlers();
      const searchHandler = handlers.find(h => h.command === EBotCommand.SEARCH);

      if (searchHandler) {
        await searchHandler.handler(mockContext as unknown as TBotContext);

        expect(mockUserService.checkSearchLimit).toHaveBeenCalledWith(123456789);
        expect(mockAnalyticsService.trackSearchLimitExceeded).toHaveBeenCalled();
        expect(mockContext.reply).toHaveBeenCalledWith(
          'Достигнут лимит поиска. Воспользуйтесь командой /stats для подробной информации.',
        );
      }
    });

    it('должен выполнять поиск если лимит не превышен', async () => {
      const mockContext = {
        user: { telegramId: 123456789, city: 'Пермь' },
        message: { text: '/search пицца' },
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
      vi.mocked(mockMessageFormatter.formatNoResultsMessage).mockReturnValue({
        text: 'Не найдено результатов',
        parseMode: 'HTML',
        replyMarkup: undefined,
      });

      const handlers = commandHandlers.getHandlers();
      const searchHandler = handlers.find(h => h.command === EBotCommand.SEARCH);

      if (searchHandler) {
        await searchHandler.handler(mockContext as unknown as TBotContext);

        expect(mockUserService.checkSearchLimit).toHaveBeenCalledWith(123456789);
        expect(mockSearchService.searchFood).toHaveBeenCalled();
      }
    });
  });

  describe('handleStats', () => {
    it('должен показывать статистику поиска', async () => {
      const mockContext = {
        user: { telegramId: 123456789 },
        reply: vi.fn(),
      };

      const mockStats = {
        totalSearches: 10,
        searchesToday: 3,
        searchesThisMonth: 25,
        lastSearchDate: new Date('2024-01-15'),
        searchLimit: 5,
        remainingSearches: 2,
      };

      const mockUser = {
        telegramId: 123456789,
        subscription: 'basic',
        city: 'Пермь',
        state: 'idle',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserService.getSearchStats).mockResolvedValue(mockStats);
      vi.mocked(mockUserService.getUser).mockResolvedValue(mockUser as any);

      const handlers = commandHandlers.getHandlers();
      const statsHandler = handlers.find(h => h.command === EBotCommand.STATS);

      if (statsHandler) {
        await statsHandler.handler(mockContext as unknown as TBotContext);

        expect(mockUserService.getSearchStats).toHaveBeenCalledWith(123456789);
        expect(mockUserService.getUser).toHaveBeenCalledWith(123456789);
        expect(mockAnalyticsService.trackBotCommand).toHaveBeenCalled();
        expect(mockAnalyticsService.trackUserStatsViewed).toHaveBeenCalled();
        expect(mockContext.reply).toHaveBeenCalledWith(
          expect.stringContaining('📊 <b>Статистика поиска</b>'),
          { parse_mode: 'HTML' },
        );
      }
    });

    it('должен обрабатывать ошибки при получении статистики', async () => {
      const mockContext = {
        user: { telegramId: 123456789 },
        reply: vi.fn(),
      };

      vi.mocked(mockUserService.getSearchStats).mockRejectedValue(new Error('Database error'));

      const handlers = commandHandlers.getHandlers();
      const statsHandler = handlers.find(h => h.command === EBotCommand.STATS);

      if (statsHandler) {
        await statsHandler.handler(mockContext as unknown as TBotContext);

        expect(mockAnalyticsService.trackBotCommandError).toHaveBeenCalled();
        expect(mockContext.reply).toHaveBeenCalledWith(
          'Не удалось загрузить статистику. Попробуйте позже.',
        );
      }
    });
  });
});
