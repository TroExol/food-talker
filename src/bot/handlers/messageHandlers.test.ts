import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { UserService } from '@/services/user/UserService/UserService';
import type { SearchService } from '@/services/search/SearchService/SearchService';

import { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';

import { MessageHandlers } from './messageHandlers';

describe('MessageHandlers', () => {
  let messageHandlers: MessageHandlers;
  let mockUserService: UserService;
  let mockSearchService: SearchService;
  let mockMessageFormatter: MessageFormatterService;

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
    } as unknown as UserService;

    mockSearchService = {
      searchFood: vi.fn(),
      enhanceResultsWithLLM: vi.fn(),
      getSearchStats: vi.fn(),
    } as unknown as SearchService;

    mockMessageFormatter = new MessageFormatterService();

    messageHandlers = new MessageHandlers(mockUserService, mockSearchService, mockMessageFormatter);
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
      expect(handlers).toHaveLength(7);

      // Проверяем, что есть обработчик для callback'ов
      const callbackHandler = handlers.find(h => h.pattern.toString().includes('city:'));
      expect(callbackHandler).toBeDefined();

      // Проверяем, что есть обработчик для текстовых сообщений
      const textHandler = handlers.find(h => h.pattern.toString() === '/.*/');
      expect(textHandler).toBeDefined();
    });
  });
});
