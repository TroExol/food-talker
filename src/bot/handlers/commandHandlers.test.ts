import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { UserService } from '@/services/user/UserService/UserService';
import type { SearchService } from '@/services/search/SearchService/SearchService';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';

import { EBotCommand } from '@/types/telegram';

import { CommandHandlers } from './commandHandlers';

// Мокаем зависимости
const mockUserService = {
  getSearchHistory: vi.fn(),
  updateUserCity: vi.fn(),
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

describe('CommandHandlers', () => {
  let commandHandlers: CommandHandlers;

  beforeEach(() => {
    commandHandlers = new CommandHandlers(
      mockUserService as unknown as UserService,
      mockSearchService as unknown as SearchService,
      mockMessageFormatter as unknown as MessageFormatterService,
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
      expect(commands).toContain(EBotCommand.SUPPORT);
    });

    it('должен иметь правильное описание для команды SEARCH', () => {
      const handlers = commandHandlers.getHandlers();
      const searchHandler = handlers.find(h => h.command === EBotCommand.SEARCH);

      expect(searchHandler).toBeDefined();
      expect(searchHandler?.description).toBe('Поиск еды по запросу');
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
});
