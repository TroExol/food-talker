import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TSearchHistoryItem, TUser } from '@/models/user';
import type { TSearchResult } from '@/models/search';

import { AppError } from '@/utils/errors';
import { ESubscriptionType } from '@/models/user';
import { EAvailableCities } from '@/config/bot';

import type { TUserRepository } from '../userRepository';

import { UserService } from '../userService';

// Mock UserRepository
const mockUserRepository: TUserRepository = {
  create: vi.fn(),
  findByTelegramId: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findExpiredSubscriptions: vi.fn(),
  addSearchHistory: vi.fn(),
  getSearchHistory: vi.fn(),
  clearSearchHistory: vi.fn(),
};

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService(mockUserRepository);
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
        city: EAvailableCities.VORONEZH,
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
      const newCity = EAvailableCities.VORONEZH;

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
        city: EAvailableCities.VORONEZH,
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepository.findByTelegramId).mockResolvedValue(existingUser);
      vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

      const result = await userService.updateUserCity(telegramId, newCity);

      expect(result).toEqual(updatedUser);
      expect(mockUserRepository.update).toHaveBeenCalledWith(telegramId, { city: 'Воронеж' });
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
      const results: TSearchResult[] = [{
        id: '1',
        name: 'Пицца Маргарита',
        restaurant: {
          id: '1',
          name: 'Додо',
        },
        description: 'Пицца Маргарита',
        ingredients: ['Молоко', 'Сыр', 'Помидоры'],
        price: 100,
        orderUrl: 'https://dodo.ru/menu/pizza-margarita',
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
});
