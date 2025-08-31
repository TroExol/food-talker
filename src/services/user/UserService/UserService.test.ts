import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TSearchResultItem } from '@/types/search';
import type { TSearchHistoryItem, TUser } from '@/services/user/UserRepository/types';
import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';
import type { CacheService } from '@/services/cacheService/CacheService';

import { AppError } from '@/utils/AppError';
import { EDishCategory } from '@/types/menuItem';
import { ESubscriptionType } from '@/services/user/UserRepository/types';
import { EAvailableCities } from '@/config/bot/types';

import type { UserRepository } from '../UserRepository/UserRepository';

import { UserService } from './UserService';

// Mock UserRepository
const mockUserRepository = {
  create: vi.fn(),
  findByTelegramId: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findExpiredSubscriptions: vi.fn(),
  addSearchHistory: vi.fn(),
  getSearchHistory: vi.fn(),
  clearSearchHistory: vi.fn(),
} as unknown as UserRepository;

const mockCacheService = {
  get: vi.fn(),
  set: vi.fn(),
} as unknown as CacheService;

const mockNeuralRequestLoggingService = {
  logRequest: vi.fn().mockResolvedValue({}),
  getUserTokenStats: vi.fn(),
  getUserTokenStatsByType: vi.fn(),
  getRecentLogs: vi.fn(),
} as unknown as NeuralRequestLoggingService;

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService(mockUserRepository, mockCacheService, mockNeuralRequestLoggingService);
  });

  describe('createUser', () => {
    it('должен создать нового пользователя', async () => {
      const telegramId = 123456789;
      const chatId = 987654321;

      const mockUser: TUser = {
        telegramId,
        chatId,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(null);
      vi.mocked(mockUserRepository.create).mockResolvedValue(mockUser);

      const result = await userService.createUser(telegramId, chatId);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findByTelegramId).toHaveBeenCalledWith(telegramId);
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          telegramId,
          chatId,
          city: EAvailableCities.PERM,
          subscription: ESubscriptionType.BASIC,
        }),
      );
    });

    it('должен вернуть существующего пользователя', async () => {
      const telegramId = 123456789;
      const chatId = 987654321;

      const existingUser: TUser = {
        telegramId,
        chatId,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(existingUser);

      const result = await userService.createUser(telegramId, chatId);

      expect(result).toEqual(existingUser);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('должен выбросить ошибку при невалидном telegramId', async () => {
      await expect(userService.createUser(-1, 123)).rejects.toThrow(AppError);
    });

    it('должен выбросить ошибку при невалидном chatId', async () => {
      await expect(userService.createUser(123, -1)).rejects.toThrow(AppError);
    });
  });

  describe('getUser', () => {
    it('должен вернуть пользователя по telegramId', async () => {
      const telegramId = 123456789;
      const mockUser: TUser = {
        telegramId,
        chatId: 987654321,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(mockUser);

      const result = await userService.getUser(telegramId);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findByTelegramId).toHaveBeenCalledWith(telegramId);
    });

    it('должен вернуть null если пользователь не найден', async () => {
      const telegramId = 123456789;

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(null);

      const result = await userService.getUser(telegramId);

      expect(result).toBeNull();
    });

    it('должен выбросить ошибку при невалидном telegramId', async () => {
      await expect(userService.getUser(-1)).rejects.toThrow(AppError);
    });
  });

  describe('updateUserCity', () => {
    it('должен обновить город пользователя', async () => {
      const telegramId = 123456789;
      const newCity = EAvailableCities.PERM;

      const existingUser: TUser = {
        telegramId,
        chatId: 987654321,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser: TUser = {
        ...existingUser,
        city: EAvailableCities.PERM,
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(existingUser);
      vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

      const result = await userService.updateUserCity(telegramId, newCity);

      expect(result).toEqual(updatedUser);
      expect(mockUserRepository.update).toHaveBeenCalledWith(telegramId, { city: EAvailableCities.PERM });
    });

    it('должен выбросить ошибку если пользователь не найден', async () => {
      const telegramId = 123456789;

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(null);

      await expect(userService.updateUserCity(telegramId, EAvailableCities.PERM)).rejects.toThrow(
        expect.objectContaining({
          code: 'USER_NOT_FOUND',
        }) as AppError,
      );
    });

    it('должен выбросить ошибку при невалидном городе', async () => {
      await expect(userService.updateUserCity(123456789, 'НеизвестныйГород' as EAvailableCities)).rejects.toThrow(
        AppError,
      );
    });
  });

  describe('updateSubscription', () => {
    it('должен обновить подписку пользователя', async () => {
      const telegramId = 123456789;
      const subscription = ESubscriptionType.BASIC;

      const existingUser: TUser = {
        telegramId,
        chatId: 987654321,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser: TUser = {
        ...existingUser,
        subscription,
        subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(existingUser);
      vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

      const result = await userService.updateSubscription(telegramId, subscription);

      expect(result).toEqual(updatedUser);
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        telegramId,
        expect.objectContaining({
          subscription,
          subscriptionExpiry: null,
        }),
      );
    });
  });

  describe('checkSubscriptionExpiry', () => {
    it('должен вернуть пользователей с просроченными подписками', async () => {
      const expiredUsers: TUser[] = [
        {
          telegramId: 123456789,
          chatId: 987654321,
          city: EAvailableCities.PERM,
          subscription: ESubscriptionType.BASIC,
          subscriptionExpiry: new Date(Date.now() - 24 * 60 * 60 * 1000), // вчера
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(mockUserRepository.findExpiredSubscriptions).mockResolvedValue(expiredUsers);

      const result = await userService.checkSubscriptionExpiry();

      expect(result).toEqual(expiredUsers);
      expect(mockUserRepository.findExpiredSubscriptions).toHaveBeenCalled();
    });
  });

  describe('addToSearchHistory', () => {
    it('должен добавить запись в историю поиска', async () => {
      const telegramId = 123456789;
      const query = 'пицца';
      const structuredQuery = { restaurants: ['Додо'] };
      const results: TSearchResultItem[] = [{
        id: '1',
        name: 'Пицца Маргарита',
        restaurant: {
          id: '1',
          name: 'Додо',
        },
        description: 'Пицца Маргарита',
        tags: ['Молоко', 'Сыр', 'Помидоры'],
        price: 100,
        orderUrl: 'https://dodo.ru/menu/pizza-margarita',
        category: EDishCategory.MAIN,
        image: 'https://dodo.ru/menu/pizza-margarita',
        available: true,
      }];

      const existingUser: TUser = {
        telegramId,
        chatId: 987654321,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const historyItem: TSearchHistoryItem = {
        id: 'uuid',
        query,
        structuredQuery,
        results,
        timestamp: new Date(),
      };

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(existingUser);
      vi.mocked(mockUserRepository.addSearchHistory).mockResolvedValue(historyItem);

      const result = await userService.addToSearchHistory(telegramId, query, structuredQuery, results);

      expect(result).toEqual(historyItem);
      expect(mockUserRepository.addSearchHistory).toHaveBeenCalledWith(
        telegramId,
        expect.objectContaining({
          query,
          structuredQuery,
          results,
        }),
      );
    });
  });

  describe('getSearchHistory', () => {
    it('должен вернуть историю поиска пользователя', async () => {
      const telegramId = 123456789;
      const history: TSearchHistoryItem[] = [
        {
          id: 'uuid1',
          query: 'пицца',
          structuredQuery: {},
          results: [],
          timestamp: new Date(),
        },
      ];

      vi.mocked(mockUserRepository.getSearchHistory).mockResolvedValue(history);

      const result = await userService.getSearchHistory(telegramId);

      expect(result).toEqual(history);
      expect(mockUserRepository.getSearchHistory).toHaveBeenCalledWith(telegramId, 10);
    });
  });

  describe('deleteUser', () => {
    it('должен удалить пользователя', async () => {
      const telegramId = 123456789;

      vi.mocked(mockUserRepository.delete).mockResolvedValue(true);

      const result = await userService.deleteUser(telegramId);

      expect(result).toBe(true);
      expect(mockUserRepository.delete).toHaveBeenCalledWith(telegramId);
    });
  });

  describe('checkSearchLimit', () => {
    it('должен вернуть true если лимит не превышен', async () => {
      const telegramId = 123456789;
      const user: TUser = {
        telegramId,
        chatId: 987654321,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const history: TSearchHistoryItem[] = [
        {
          id: 'uuid1',
          query: 'пицца',
          structuredQuery: {},
          results: [],
          timestamp: new Date(),
        },
        {
          id: 'uuid2',
          query: 'суши',
          structuredQuery: {},
          results: [],
          timestamp: new Date(),
        },
      ];

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(user);
      vi.mocked(mockUserRepository.getSearchHistory).mockResolvedValue(history);

      const result = await userService.checkSearchLimit(telegramId);

      expect(result).toBe(true);
    });

    it('должен вернуть false если лимит превышен', async () => {
      const telegramId = 123456789;
      const user: TUser = {
        telegramId,
        chatId: 987654321,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Создаем 5 поисков за сегодня (лимит для basic подписки)
      const history: TSearchHistoryItem[] = Array.from({ length: 30 }, (_, i) => ({
        id: `uuid${i}`,
        query: `поиск ${i}`,
        structuredQuery: {},
        results: [],
        timestamp: new Date(),
      }));

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(user);
      vi.mocked(mockUserRepository.getSearchHistory).mockResolvedValue(history);

      const result = await userService.checkSearchLimit(telegramId);

      expect(result).toBe(false);
    });

    it('должен выбросить ошибку если пользователь не найден', async () => {
      const telegramId = 123456789;

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(null);

      await expect(userService.checkSearchLimit(telegramId)).rejects.toThrow(AppError);
    });
  });

  describe('getSearchStats', () => {
    it('должен вернуть статистику поиска', async () => {
      const telegramId = 123456789;
      const user: TUser = {
        telegramId,
        chatId: 987654321,
        city: EAvailableCities.PERM,
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const history: TSearchHistoryItem[] = [
        {
          id: 'uuid1',
          query: 'пицца',
          structuredQuery: {},
          results: [],
          timestamp: new Date(),
        },
        {
          id: 'uuid2',
          query: 'суши',
          structuredQuery: {},
          results: [],
          timestamp: new Date(),
        },
      ];

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(user);
      vi.mocked(mockUserRepository.getSearchHistory).mockResolvedValue(history);

      const result = await userService.getSearchStats(telegramId);

      expect(result).toEqual({
        totalSearches: 2,
        searchesToday: 2,
        searchesThisMonth: 2,
        lastSearchDate: expect.any(Date) as Date,
        searchLimit: 30,
        remainingSearches: 28,
      });
    });
  });
});
