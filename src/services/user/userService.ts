import type { TSearchHistoryItem, TUser } from '@/models/user';
import type { TSearchResult, TStructuredQuery } from '@/models/search';

import { validator } from '@/utils/validation';
import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';
import { ESubscriptionType } from '@/models/user';
import { createDatabaseConnection } from '@/config/database';
import { EAvailableCities } from '@/config/bot';

import { type TUserRepository, UserRepository } from './userRepository';

export interface TUserService {
  createUser(telegramId: number, chatId: number): Promise<TUser>;
  getUser(telegramId: number): Promise<TUser | null>;
  updateUserCity(telegramId: number, city: EAvailableCities): Promise<TUser>;
  updateSubscription(telegramId: number, subscription: ESubscriptionType): Promise<TUser>;
  checkSubscriptionExpiry(): Promise<TUser[]>;
  addToSearchHistory(
    telegramId: number,
    query: string,
    structuredQuery: TStructuredQuery,
    results: TSearchResult[],
  ): Promise<TSearchHistoryItem>;
  getSearchHistory(telegramId: number, limit?: number): Promise<TSearchHistoryItem[]>;
  clearSearchHistory(telegramId: number): Promise<void>;
  deleteUser(telegramId: number): Promise<boolean>;
}

export class UserService implements TUserService {
  private userRepository: TUserRepository;

  constructor(userRepository?: TUserRepository) {
    if (userRepository) {
      this.userRepository = userRepository;
    } else {
      // Для production использования нужно передать userRepository извне
      throw new Error('UserRepository должен быть передан в конструктор');
    }
  }

  static create = async (userRepository?: TUserRepository): Promise<UserService> => {
    if (userRepository) {
      return new UserService(userRepository);
    }

    const db = await createDatabaseConnection();
    const repository = new UserRepository(db);
    return new UserService(repository);
  };

  public createUser = async (telegramId: number, chatId: number): Promise<TUser> => {
    // Валидация входных данных
    const telegramIdValidation = validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const chatIdValidation = validator.validateChatId(chatId);
    if (!chatIdValidation.isValid) {
      throw AppError.validationError('INVALID_CHAT_ID', chatIdValidation.errors[0]);
    }

    try {
      // Проверяем, не существует ли уже пользователь
      const existingUser = await this.userRepository.findByTelegramId(telegramId);
      if (existingUser) {
        logger.info('Пользователь уже существует', { telegramId });
        return existingUser;
      }

      // Создаем нового пользователя с базовыми настройками
      const userData = {
        telegramId,
        chatId,
        city: EAvailableCities.PERM, // Город по умолчанию
        subscription: ESubscriptionType.BASIC,
        subscriptionExpiry: null,
      };

      const user = await this.userRepository.create(userData);
      logger.info('Новый пользователь создан', { telegramId });
      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка создания пользователя', error as Error, { telegramId });
      throw AppError.systemError('USER_CREATION_FAILED', 'Не удалось создать пользователя');
    }
  };

  public getUser = async (telegramId: number): Promise<TUser | null> => {
    const validation = validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      return await this.userRepository.findByTelegramId(telegramId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка получения пользователя', error as Error, { telegramId });
      throw AppError.systemError('USER_FETCH_FAILED', 'Не удалось получить данные пользователя');
    }
  };

  public updateUserCity = async (telegramId: number, city: EAvailableCities): Promise<TUser> => {
    // Валидация данных
    const telegramIdValidation = validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const cityValidation = validator.validateCity(city);
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

      logger.info('Город пользователя обновлен', { telegramId, city: sanitizedCity });
      return updatedUser;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка обновления города пользователя', error as Error, { telegramId, city });
      throw AppError.systemError('USER_CITY_UPDATE_FAILED', 'Не удалось обновить город пользователя');
    }
  };

  public updateSubscription = async (telegramId: number, subscription: ESubscriptionType): Promise<TUser> => {
    // Валидация данных
    const telegramIdValidation = validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const subscriptionValidation = validator.validateSubscriptionType(subscription);
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

      logger.info('Подписка пользователя обновлена', { telegramId, subscription });
      return updatedUser;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка обновления подписки', error as Error, { telegramId, subscription });
      throw AppError.systemError('SUBSCRIPTION_UPDATE_FAILED', 'Не удалось обновить подписку');
    }
  };

  public checkSubscriptionExpiry = async (): Promise<TUser[]> => {
    try {
      const expiredUsers = await this.userRepository.findExpiredSubscriptions();
      logger.info('Найдены пользователи с просроченными подписками', { count: expiredUsers.length });
      return expiredUsers;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка проверки просроченных подписок', error as Error);
      throw AppError.systemError('SUBSCRIPTION_CHECK_FAILED', 'Не удалось проверить просроченные подписки');
    }
  };

  public addToSearchHistory = async (
    telegramId: number,
    query: string,
    structuredQuery: TStructuredQuery,
    results: TSearchResult[],
  ): Promise<TSearchHistoryItem> => {
    // Валидация данных
    const telegramIdValidation = validator.validateTelegramId(telegramId);
    if (!telegramIdValidation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', telegramIdValidation.errors[0]);
    }

    const queryValidation = validator.validateSearchQuery(query);
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
      logger.error('Ошибка добавления в историю поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_HISTORY_ADD_FAILED', 'Не удалось добавить запись в историю поиска');
    }
  };

  public getSearchHistory = async (telegramId: number, limit = 10): Promise<TSearchHistoryItem[]> => {
    const validation = validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      return await this.userRepository.getSearchHistory(telegramId, limit);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка получения истории поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_HISTORY_GET_FAILED', 'Не удалось получить историю поиска');
    }
  };

  public clearSearchHistory = async (telegramId: number): Promise<void> => {
    const validation = validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      await this.userRepository.clearSearchHistory(telegramId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка очистки истории поиска', error as Error, { telegramId });
      throw AppError.systemError('SEARCH_HISTORY_CLEAR_FAILED', 'Не удалось очистить историю поиска');
    }
  };

  public deleteUser = async (telegramId: number): Promise<boolean> => {
    const validation = validator.validateTelegramId(telegramId);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_TELEGRAM_ID', validation.errors[0]);
    }

    try {
      return await this.userRepository.delete(telegramId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка удаления пользователя', error as Error, { telegramId });
      throw AppError.systemError('USER_DELETE_FAILED', 'Не удалось удалить пользователя');
    }
  };

  private calculateSubscriptionExpiry = (subscription: ESubscriptionType): Date | null => {
    const validation = validator.validateSubscriptionType(subscription);
    if (!validation.isValid) {
      throw AppError.validationError('INVALID_SUBSCRIPTION', validation.errors[0]);
    }

    switch (subscription) {
      case ESubscriptionType.BASIC:
        // Базовая подписка не имеет срока действия
        return null;
      default:
        throw AppError.systemError('INVALID_SUBSCRIPTION', 'Неверный тип подписки');
    }
  };
}
