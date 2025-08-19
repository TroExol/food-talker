import { v4 as uuidv4 } from 'uuid';

import type {
  ESubscriptionType,
  TSearchHistoryEntity,
  TSearchHistoryItem,
  TUser,
  TUserEntity,
} from '@/models/user';
import type { TDatabaseConnection } from '@/config/database';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

export interface TUserRepository {
  create: (userData: Omit<TUser, 'createdAt' | 'updatedAt'>) => Promise<TUser>;
  findByTelegramId: (telegramId: number) => Promise<TUser | null>;
  update: (telegramId: number, updates: Partial<Pick<TUser, 'city' | 'subscription' | 'subscriptionExpiry'>>) => Promise<TUser>;
  delete: (telegramId: number) => Promise<boolean>;
  findExpiredSubscriptions: () => Promise<TUser[]>;
  addSearchHistory: (telegramId: number, historyItem: Omit<TSearchHistoryItem, 'id' | 'timestamp'>) => Promise<TSearchHistoryItem>;
  getSearchHistory: (telegramId: number, limit?: number) => Promise<TSearchHistoryItem[]>;
  clearSearchHistory: (telegramId: number) => Promise<void>;
}

export class UserRepository implements TUserRepository {
  constructor(private db: TDatabaseConnection) {}

  public create = async (userData: Omit<TUser, 'createdAt' | 'updatedAt'>): Promise<TUser> => {
    try {
      const now = new Date().toISOString();

      await this.db.run(`
        INSERT INTO users (telegram_id, chat_id, city, subscription_type, subscription_expiry, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        userData.telegramId,
        userData.chatId,
        userData.city,
        userData.subscription,
        userData.subscriptionExpiry?.toISOString() ?? null,
        now,
        now,
      ]);

      const user: TUser = {
        ...userData,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };

      logger.info('Пользователь создан', { telegramId: userData.telegramId });
      return user;
    } catch (error) {
      logger.error('Ошибка создания пользователя', error as Error, { telegramId: userData.telegramId });
      throw AppError.databaseError('USER_CREATE_FAILED', 'Не удалось создать пользователя');
    }
  };

  public findByTelegramId = async (telegramId: number): Promise<TUser | null> => {
    try {
      const userEntity = await this.db.get<TUserEntity>(`
        SELECT * FROM users WHERE telegram_id = ?
      `, [telegramId]);

      if (!userEntity) {
        return null;
      }

      return this.entityToUser(userEntity);
    } catch (error) {
      logger.error('Ошибка поиска пользователя', error as Error, { telegramId });
      throw AppError.databaseError('USER_FIND_FAILED', 'Не удалось найти пользователя');
    }
  };

  public update = async (telegramId: number, updates: Partial<Pick<TUser, 'city' | 'subscription' | 'subscriptionExpiry'>>): Promise<TUser> => {
    try {
      const setParts: string[] = [];
      const values: unknown[] = [];

      if (updates.city !== undefined) {
        setParts.push('city = ?');
        values.push(updates.city);
      }
      if (updates.subscription !== undefined) {
        setParts.push('subscription_type = ?');
        values.push(updates.subscription);
      }
      if (updates.subscriptionExpiry !== undefined) {
        setParts.push('subscription_expiry = ?');
        values.push(updates.subscriptionExpiry?.toISOString() ?? null);
      }

      if (setParts.length === 0) {
        throw AppError.validationError('NO_UPDATES', 'Нет данных для обновления');
      }

      setParts.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(telegramId);

      const result = await this.db.run(`
        UPDATE users SET ${setParts.join(', ')} WHERE telegram_id = ?
      `, values);

      if (result.changes === 0) {
        throw AppError.userNotFound(telegramId);
      }

      const updatedUser = await this.findByTelegramId(telegramId);
      if (!updatedUser) {
        throw AppError.systemError('USER_UPDATE_INCONSISTENT', 'Пользователь обновлен но не найден');
      }

      logger.info('Пользователь обновлен', { telegramId, updates });
      return updatedUser;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Ошибка обновления пользователя', error as Error, { telegramId });
      throw AppError.databaseError('USER_UPDATE_FAILED', 'Не удалось обновить пользователя');
    }
  };

  public delete = async (telegramId: number): Promise<boolean> => {
    try {
      // Сначала удаляем историю поиска
      await this.db.run(`DELETE FROM search_history WHERE user_telegram_id = ?`, [telegramId]);

      // Затем удаляем пользователя
      const result = await this.db.run(`DELETE FROM users WHERE telegram_id = ?`, [telegramId]);

      const deleted = result.changes > 0;
      if (deleted) {
        logger.info('Пользователь удален', { telegramId });
      }

      return deleted;
    } catch (error) {
      logger.error('Ошибка удаления пользователя', error as Error, { telegramId });
      throw AppError.databaseError('USER_DELETE_FAILED', 'Не удалось удалить пользователя');
    }
  };

  public findExpiredSubscriptions = async (): Promise<TUser[]> => {
    try {
      const now = new Date().toISOString();
      const entities = await this.db.query<TUserEntity>(`
        SELECT * FROM users WHERE subscription_expiry IS NOT NULL AND subscription_expiry < ?
      `, [now]);

      return entities.map(entity => this.entityToUser(entity));
    } catch (error) {
      logger.error('Ошибка поиска просроченных подписок', error as Error);
      throw AppError.databaseError('EXPIRED_SUBSCRIPTIONS_FAILED', 'Не удалось найти просроченные подписки');
    }
  };

  public addSearchHistory = async (telegramId: number, historyItem: Omit<TSearchHistoryItem, 'id' | 'timestamp'>): Promise<TSearchHistoryItem> => {
    try {
      const id = uuidv4();
      const timestamp = new Date();

      await this.db.run(`
        INSERT INTO search_history (id, user_telegram_id, query, structured_query, results_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        id,
        telegramId,
        historyItem.query,
        JSON.stringify(historyItem.structuredQuery),
        historyItem.results.length,
        timestamp.toISOString(),
      ]);

      const searchHistoryItem: TSearchHistoryItem = {
        id,
        ...historyItem,
        timestamp,
      };

      logger.info('Добавлена запись в историю поиска', { telegramId, query: historyItem.query });
      return searchHistoryItem;
    } catch (error) {
      logger.error('Ошибка добавления в историю поиска', error as Error, { telegramId });
      throw AppError.databaseError('SEARCH_HISTORY_ADD_FAILED', 'Не удалось добавить запись в историю');
    }
  };

  public getSearchHistory = async (telegramId: number, limit = 10): Promise<TSearchHistoryItem[]> => {
    try {
      const entities = await this.db.query<TSearchHistoryEntity>(`
        SELECT * FROM search_history 
        WHERE user_telegram_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `, [telegramId, limit]);

      // Для истории поиска нам нужны полные результаты, но они не хранятся в БД
      // Возвращаем упрощенную версию без results
      return entities.map(entity => ({
        id: entity.id,
        query: entity.query,
        structuredQuery: JSON.parse(entity.structured_query) as TSearchHistoryItem['structuredQuery'],
        results: [], // Результаты не сохраняются в БД
        timestamp: new Date(entity.created_at),
      }));
    } catch (error) {
      logger.error('Ошибка получения истории поиска', error as Error, { telegramId });
      throw AppError.databaseError('SEARCH_HISTORY_GET_FAILED', 'Не удалось получить историю поиска');
    }
  };

  public clearSearchHistory = async (telegramId: number): Promise<void> => {
    try {
      await this.db.run(`DELETE FROM search_history WHERE user_telegram_id = ?`, [telegramId]);
      logger.info('История поиска очищена', { telegramId });
    } catch (error) {
      logger.error('Ошибка очистки истории поиска', error as Error, { telegramId });
      throw AppError.databaseError('SEARCH_HISTORY_CLEAR_FAILED', 'Не удалось очистить историю поиска');
    }
  };

  private entityToUser = (entity: TUserEntity): TUser => {
    return {
      telegramId: entity.telegram_id,
      chatId: entity.chat_id,
      city: entity.city,
      subscription: entity.subscription_type as ESubscriptionType,
      subscriptionExpiry: entity.subscription_expiry ? new Date(entity.subscription_expiry) : null,
      createdAt: new Date(entity.created_at),
      updatedAt: new Date(entity.updated_at),
    };
  };
}
