import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TSearchResultItem } from '@/types/search';
import type { UserService } from '@/services/user/UserService/UserService';
import type { SearchService } from '@/services/search/SearchService/SearchService';

import { MessageHandlers } from './messageHandlers';

describe('MessageHandlers', () => {
  let messageHandlers: MessageHandlers;
  let mockUserService: UserService;
  let mockSearchService: SearchService;

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

    messageHandlers = new MessageHandlers(mockUserService, mockSearchService);
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
      expect(handlers).toHaveLength(2);

      // Проверяем, что есть обработчик для callback'ов
      const callbackHandler = handlers.find(h => h.pattern.toString().includes('city:'));
      expect(callbackHandler).toBeDefined();

      // Проверяем, что есть обработчик для текстовых сообщений
      const textHandler = handlers.find(h => h.pattern.toString() === '/.*/');
      expect(textHandler).toBeDefined();
    });
  });

  describe('formatSearchResults', () => {
    it('should format search results correctly', () => {
      const mockResults: TSearchResultItem[] = [
        {
          id: '1',
          description: 'Описание пиццы',
          tags: ['пицца', 'марианская'],
          orderUrl: 'https://example.com/order/1',
          name: 'Пицца Маргарита',
          price: 500,
          restaurant: { id: '1', name: 'Пиццерия' },
        },
        {
          id: '2',
          description: 'Описание бургера',
          tags: ['бургер', 'классический'],
          orderUrl: 'https://example.com/order/2',
          name: 'Бургер Классический',
          price: 300,
          restaurant: { id: '2', name: 'Бургерная' },
        },
      ];

      type TMessageHandlers = { formatSearchResults: (results: TSearchResultItem[], query: string) => string };
      const formatted = (messageHandlers as unknown as TMessageHandlers).formatSearchResults(mockResults, 'пицца');

      expect(formatted).toContain('🍽️ Найдено 2 результатов по запросу "пицца"');
      expect(formatted).toContain('1. Пицца Маргарита');
      expect(formatted).toContain('🏪 Пиццерия');
      expect(formatted).toContain('💰 500 ₽');
      expect(formatted).toContain('2. Бургер Классический');
    });

    it('should handle empty results', () => {
      type TMessageHandlers = { formatSearchResults: (results: TSearchResultItem[], query: string) => string };
      const formatted = (messageHandlers as unknown as TMessageHandlers).formatSearchResults([], 'несуществующий запрос');

      expect(formatted).toContain('🍽️ Найдено 0 результатов');
    });

    it('should limit results to 10 items', () => {
      const mockResults: TSearchResultItem[] = Array.from({ length: 15 }, (_, i) => ({
        id: `id-${i + 1}`,
        description: `Описание блюда ${i + 1}`,
        tags: [`тег${i + 1}`, `тег${i + 1}`],
        orderUrl: `https://example.com/order/${i + 1}`,
        name: `Блюдо ${i + 1}`,
        price: 100,
        restaurant: { id: `id-${i + 1}`, name: `Ресторан ${i + 1}` },
      }));

      type TMessageHandlers = { formatSearchResults: (results: TSearchResultItem[], query: string) => string };
      const formatted = (messageHandlers as unknown as TMessageHandlers).formatSearchResults(mockResults, 'тест');

      expect(formatted).toContain('🍽️ Найдено 15 результатов');
      expect(formatted).toContain('... и еще 5 результатов');
      expect(formatted).toContain('10. Блюдо 10');
      expect(formatted).not.toContain('11. Блюдо 11');
    });
  });
});
