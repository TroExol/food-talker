import type { User } from 'telegraf/types';

import { createHash } from 'crypto';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { TTokenUsageStats } from '@/types/neuralRequestLogging';
import type {
  TSearchHistoryItem,
  TSearchStats,
  TUser,
} from '@/services/user/UserRepository/types';
import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';
import type { CacheService } from '@/services/cacheService/CacheService';
import type { EAvailableCities } from '@/config/bot/types';

import { Validator } from '@/utils/Validator';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { ESubscriptionType, SEARCH_LIMITS_PER_DAY } from '@/services/user/UserRepository/types';

import type { UserRepository } from '../UserRepository/UserRepository';

export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly cacheService: CacheService,
    private readonly neuralRequestLoggingService: NeuralRequestLoggingService,
  ) {}

  public createUser = async (telegramId: string, chatId: string): Promise<TUser> => {
    // Валидация входных данных
    const telegramIdValidation = Validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const chatIdValidation = Validator.validateChatId(chatId);
    if (!chatIdValidation.isValid) {
      throw AppError.validationError('INVALID_CHAT_ID', chatIdValidation.errors[0]);
    }

    try {
      // Проверяем, не существует ли уже пользователь
      const existingUser = await this.userRepository.findByTelegramId(telegramId);
      if (existingUser) {
        ConsoleLogger.info('Пользователь уже существует', { telegramId });
        return existingUser;
      }

      // Создаем нового пользователя с базовыми настройками
      const userData = {
        telegramId,
        chatId,
        city: null, // Город по умолчанию
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: null,
      };

      const user = await this.userRepository.create(userData);
      ConsoleLogger.info('Новый пользователь создан', { telegramId });
      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка создания пользователя', error as Error, { telegramId });
      throw AppError.systemError('USER_CREATION_FAILED', 'Не удалось создать пользователя');
    }
  };

  public getUser = async (telegramId: string): Promise<TUser | null> => {
    const validation = Validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      return await this.userRepository.findByTelegramId(telegramId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка получения пользователя', error as Error, { telegramId });
      throw AppError.systemError('USER_FETCH_FAILED', 'Не удалось получить данные пользователя');
    }
  };

  public updateUserCity = async (telegramId: string, city: EAvailableCities): Promise<TUser> => {
    // Валидация данных
    const telegramIdValidation = Validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const cityValidation = Validator.validateCity(city);
    if (!cityValidation.isValid) {
      throw AppError.validationError('INVALID_CITY', cityValidation.errors[0]);
    }

    try {
      // Проверяем, существует ли пользователь
      const existingUser = await this.userRepository.findByTelegramId(telegramId);
      if (!existingUser) {
        throw AppError.userNotFound(telegramId);
      }

      const sanitizedCity = cityValidation.sanitizedInput as EAvailableCities;
      const updatedUser = await this.userRepository.update(telegramId, { city: sanitizedCity });

      ConsoleLogger.info('Город пользователя обновлен', { telegramId, city: sanitizedCity });
      return updatedUser;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка обновления города пользователя', error as Error, { telegramId, city });
      throw AppError.systemError('USER_CITY_UPDATE_FAILED', 'Не удалось обновить город пользователя');
    }
  };

  public updateSubscription = async (telegramId: string, subscription: ESubscriptionType): Promise<TUser> => {
    // Валидация данных
    const telegramIdValidation = Validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const subscriptionValidation = Validator.validateSubscriptionType(subscription);
    if (!subscriptionValidation.isValid) {
      throw AppError.validationError('INVALID_SUBSCRIPTION', subscriptionValidation.errors[0]);
    }

    try {
      // Проверяем, существует ли пользователь
      const existingUser = await this.userRepository.findByTelegramId(telegramId);
      if (!existingUser) {
        throw AppError.userNotFound(telegramId);
      }

      // Обновляем подписку и дату истечения
      const subscriptionExpiry = this.calculateSubscriptionExpiry(subscription);

      const updatedUser = await this.userRepository.update(telegramId, {
        subscription,
        subscriptionExpiry,
      });

      ConsoleLogger.info('Подписка пользователя обновлена', { telegramId, subscription });
      return updatedUser;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка обновления подписки', error as Error, { telegramId, subscription });
      throw AppError.systemError('SUBSCRIPTION_UPDATE_FAILED', 'Не удалось обновить подписку');
    }
  };

  public checkSubscriptionExpiry = async (): Promise<TUser[]> => {
    try {
      const expiredUsers = await this.userRepository.findExpiredSubscriptions();
      ConsoleLogger.info('Найдены пользователи с просроченными подписками', { count: expiredUsers.length });
      return expiredUsers;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка проверки просроченных подписок', error as Error);
      throw AppError.systemError('SUBSCRIPTION_CHECK_FAILED', 'Не удалось проверить просроченные подписки');
    }
  };

  public addToSearchHistory = async (
    telegramId: string,
    query: string,
    structuredQuery: TStructuredQuery,
    results: TSearchResultItem[],
  ): Promise<TSearchHistoryItem> => {
    // Валидация данных
    const telegramIdValidation = Validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const queryValidation = Validator.validateSearchQuery(query);
    if (!queryValidation.isValid) {
      throw AppError.validationError('INVALID_QUERY', queryValidation.errors[0]);
    }

    try {
      // Проверяем, существует ли пользователь
      const existingUser = await this.userRepository.findByTelegramId(telegramId);
      if (!existingUser) {
        throw AppError.userNotFound(telegramId);
      }

      const historyItem = await this.userRepository.addSearchHistory(telegramId, {
        query: queryValidation.sanitizedInput as string,
        structuredQuery,
        results,
      });

      return historyItem;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка добавления в историю поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_HISTORY_ADD_FAILED', 'Не удалось добавить запись в историю поиска');
    }
  };

  public getSearchHistory = async (telegramId: string, limit = 10): Promise<TSearchHistoryItem[]> => {
    const validation = Validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      return await this.userRepository.getSearchHistory(telegramId, limit);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка получения истории поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_HISTORY_GET_FAILED', 'Не удалось получить историю поиска');
    }
  };

  public getSearchHistoryItemById = async (telegramId: string, id: string): Promise<TSearchHistoryItem | null> => {
    const validation = Validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      const cacheKey = this.generateCacheKey('search_history_item', telegramId, id);
      const cachedItem = await this.cacheService.get(cacheKey);
      if (cachedItem) {
        return cachedItem as TSearchHistoryItem;
      }
      const item = await this.userRepository.getSearchHistoryItemById(telegramId, id);
      await this.cacheService.set(cacheKey, item, 60 * 60 * 0.25); // 15 минут
      return item;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка получения истории поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_HISTORY_GET_FAILED', 'Не удалось получить историю поиска');
    }
  };

  public clearSearchHistory = async (telegramId: string): Promise<void> => {
    const validation = Validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      await this.userRepository.clearSearchHistory(telegramId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка очистки истории поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_HISTORY_CLEAR_FAILED', 'Не удалось очистить историю поиска');
    }
  };

  public deleteUser = async (telegramId: string): Promise<boolean> => {
    const validation = Validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      return await this.userRepository.delete(telegramId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка удаления пользователя', error as Error, { telegramId });
      throw AppError.systemError('USER_DELETE_FAILED', 'Не удалось удалить пользователя');
    }
  };

  private calculateSubscriptionExpiry = (subscription: ESubscriptionType): Date | null => {
    const validation = Validator.validateSubscriptionType(subscription);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_SUBSCRIPTION', validation.errors[0]);
    }

    // TODO: Если подписка не меняется, то время новой подписки прибавляется к старому времени истечения

    switch (subscription) {
      case ESubscriptionType.BASIC:
        // Базовая подписка не имеет срока действия
        return null;
      default:
        throw AppError.systemError('INVALID_SUBSCRIPTION', 'Неверный тип подписки');
    }
  };

  private generateCacheKey = (type: string, ...params: unknown[]): string => {
    const data = JSON.stringify({ type, params });
    return `user_service:${createHash('sha256').update(data).digest('hex')}`;
  };

  public checkSearchLimit = async (user: User): Promise<boolean> => {
    const validation = Validator.validateTelegramId(user.id.toString());
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      const userDb = await this.getUser(user.id.toString());
      if (!userDb) {
        throw AppError.userNotFound(user.id.toString());
      }

      const searchLimit = SEARCH_LIMITS_PER_DAY[userDb.subscription];
      const searchesToday = await this.getSearchesToday(userDb.telegramId);

      const canSearch = searchesToday < searchLimit;

      ConsoleLogger.info('Проверка лимита поиска', {
        telegramId: user.id,
        subscription: userDb.subscription,
        searchLimit,
        searchesToday,
        canSearch,
      });

      return canSearch;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка проверки лимита поиска', error as Error, { telegramId: user.id });
      throw AppError.systemError('SEARCH_LIMIT_CHECK_FAILED', 'Не удалось проверить лимит поиска');
    }
  };

  public getSearchStats = async (telegramId: string): Promise<TSearchStats> => {
    const validation = Validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      const user = await this.getUser(telegramId);
      if (!user) {
        throw AppError.userNotFound(telegramId);
      }

      const [searchesToday, searchesThisMonth, totalSearches, lastSearchDate] = await Promise.all([
        this.getSearchesToday(telegramId),
        this.getSearchesThisMonth(telegramId),
        this.getTotalSearches(telegramId),
        this.getLastSearchDate(telegramId),
      ]);

      const searchLimit = SEARCH_LIMITS_PER_DAY[user.subscription];
      const remainingSearches = Math.max(0, searchLimit - searchesToday);

      return {
        totalSearches,
        searchesToday,
        searchesThisMonth,
        lastSearchDate,
        searchLimit,
        remainingSearches,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка получения статистики поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_STATS_GET_FAILED', 'Не удалось получить статистику поиска');
    }
  };

  private getSearchesToday = async (telegramId: string): Promise<number> => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const history = await this.userRepository.getSearchHistory(telegramId, 1000);
      const searchesToday = history.filter(item => {
        const searchDate = new Date(item.timestamp);
        return searchDate >= today && searchDate < tomorrow;
      }).length;

      return searchesToday;
    } catch (error) {
      ConsoleLogger.error('Ошибка подсчета поисков за сегодня', error as Error, { telegramId });
      return 0;
    }
  };

  private getSearchesThisMonth = async (telegramId: string): Promise<number> => {
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const history = await this.userRepository.getSearchHistory(telegramId, 1000);
      const searchesThisMonth = history.filter(item => {
        const searchDate = new Date(item.timestamp);
        return searchDate >= firstDayOfMonth && searchDate < firstDayOfNextMonth;
      }).length;

      return searchesThisMonth;
    } catch (error) {
      ConsoleLogger.error('Ошибка подсчета поисков за месяц', error as Error, { telegramId });
      return 0;
    }
  };

  private getTotalSearches = async (telegramId: string): Promise<number> => {
    try {
      const history = await this.userRepository.getSearchHistory(telegramId, 1000);
      return history.length;
    } catch (error) {
      ConsoleLogger.error('Ошибка подсчета общего количества поисков', error as Error, { telegramId });
      return 0;
    }
  };

  private getLastSearchDate = async (telegramId: string): Promise<Date | null> => {
    try {
      const history = await this.userRepository.getSearchHistory(telegramId, 1);
      return history.length > 0 ? new Date(history[0].timestamp) : null;
    } catch (error) {
      ConsoleLogger.error('Ошибка получения даты последнего поиска', error as Error, { telegramId });
      return null;
    }
  };

  public getTokenUsageStats = async (telegramId: string, days = 30): Promise<TTokenUsageStats | null> => {
    const validation = Validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      const user = await this.getUser(telegramId);
      if (!user) {
        throw AppError.userNotFound(telegramId);
      }

      return await this.neuralRequestLoggingService.getUserTokenStats(telegramId, days);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка получения статистики токенов', error as Error, { telegramId });
      throw AppError.systemError('TOKEN_STATS_GET_FAILED', 'Не удалось получить статистику токенов');
    }
  };
}
