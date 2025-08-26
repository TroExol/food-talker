import { v4 as uuidv4 } from 'uuid';

import type {
  ESubscriptionType,
  TSearchHistoryEntity,
  TSearchHistoryItem,
  TUser,
  TUserEntity,
} from '@/services/user/UserRepository/types';
import type { TDatabaseConnection } from '@/services/database/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

interface TUserRepository {
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
  constructor(private readonly db: TDatabaseConnection) {}

  public create = async (userData: Omit<TUser, 'createdAt' | 'updatedAt'>): Promise<TUser> => {
    try {
      const now = new Date().toISOString();

      await this.db.run(`
        INSERT INTO users (telegram_id, chat_id, city, subscription_type, subscription_expiry, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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

      ConsoleLogger.info('Пользователь создан', { telegramId: userData.telegramId });
      return user;
    } catch (error) {
      ConsoleLogger.error('Ошибка создания пользователя', error as Error, { telegramId: userData.telegramId });
      throw AppError.databaseError('USER_CREATE_FAILED', 'Не удалось создать пользователя');
    }
  };

  public findByTelegramId = async (telegramId: number): Promise<TUser | null> => {
    try {
      const userEntity = await this.db.get<TUserEntity>(`
        SELECT * FROM users WHERE telegram_id = $1
      `, [telegramId]);

      if (!userEntity) {
        return null;
      }

      return this.entityToUser(userEntity);
    } catch (error) {
      ConsoleLogger.error('Ошибка поиска пользователя', error as Error, { telegramId });
      throw AppError.databaseError('USER_FIND_FAILED', 'Не удалось найти пользователя');
    }
  };

  public update = async (telegramId: number, updates: Partial<Pick<TUser, 'city' | 'subscription' | 'subscriptionExpiry'>>): Promise<TUser> => {
    try {
      const setParts: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.city !== undefined) {
        setParts.push(`city = $${paramIndex}`);
        paramIndex++;
        values.push(updates.city);
      }
      if (updates.subscription !== undefined) {
        setParts.push(`subscription_type = $${paramIndex}`);
        paramIndex++;
        values.push(updates.subscription);
      }
      if (updates.subscriptionExpiry !== undefined) {
        setParts.push(`subscription_expiry = $${paramIndex}`);
        paramIndex++;
        values.push(updates.subscriptionExpiry?.toISOString() ?? null);
      }

      if (setParts.length === 0) {
        throw AppError.validationError('NO_UPDATES', 'Нет данных для обновления');
      }

      setParts.push(`updated_at = $${paramIndex}`);
      paramIndex++;
      values.push(new Date().toISOString());
      values.push(telegramId);

      const result = await this.db.run(`
        UPDATE users SET ${setParts.join(', ')} WHERE telegram_id = $${paramIndex}
      `, values);

      if (result.changes === 0) {
        throw AppError.userNotFound(telegramId);
      }

      const updatedUser = await this.findByTelegramId(telegramId);
      if (!updatedUser) {
        throw AppError.systemError('USER_UPDATE_INCONSISTENT', 'Пользователь обновлен но не найден');
      }

      ConsoleLogger.info('Пользователь обновлен', { telegramId, updates });
      return updatedUser;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка обновления пользователя', error as Error, { telegramId });
      throw AppError.databaseError('USER_UPDATE_FAILED', 'Не удалось обновить пользователя');
    }
  };

  public delete = async (telegramId: number): Promise<boolean> => {
    try {
      // Сначала удаляем историю поиска
      await this.db.run(`DELETE FROM search_history WHERE user_telegram_id = $1`, [telegramId]);

      // Затем удаляем пользователя
      const result = await this.db.run(`DELETE FROM users WHERE telegram_id = $1`, [telegramId]);

      const deleted = result.changes > 0;
      if (deleted) {
        ConsoleLogger.info('Пользователь удален', { telegramId });
      }

      return deleted;
    } catch (error) {
      ConsoleLogger.error('Ошибка удаления пользователя', error as Error, { telegramId });
      throw AppError.databaseError('USER_DELETE_FAILED', 'Не удалось удалить пользователя');
    }
  };

  public findExpiredSubscriptions = async (): Promise<TUser[]> => {
    try {
      const now = new Date().toISOString();
      const entities = await this.db.query<TUserEntity>(`
        SELECT * FROM users WHERE subscription_expiry IS NOT NULL AND subscription_expiry < $1
      `, [now]);

      return entities.map(entity => this.entityToUser(entity));
    } catch (error) {
      ConsoleLogger.error('Ошибка поиска просроченных подписок', error as Error);
      throw AppError.databaseError('EXPIRED_SUBSCRIPTIONS_FAILED', 'Не удалось найти просроченные подписки');
    }
  };

  public addSearchHistory = async (telegramId: number, historyItem: Omit<TSearchHistoryItem, 'id' | 'timestamp'>): Promise<TSearchHistoryItem> => {
    try {
      const id = uuidv4();
      const timestamp = new Date();

      await this.db.run(`
        INSERT INTO search_history (id, user_telegram_id, query, structured_query, results, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        id,
        telegramId,
        historyItem.query,
        JSON.stringify(historyItem.structuredQuery ? historyItem.structuredQuery : {}),
        JSON.stringify(historyItem.results ? historyItem.results : []),
        timestamp.toISOString(),
      ]);

      const searchHistoryItem: TSearchHistoryItem = {
        id,
        ...historyItem,
        timestamp,
      };

      ConsoleLogger.info('Добавлена запись в историю поиска', { telegramId, query: historyItem.query });
      return searchHistoryItem;
    } catch (error) {
      ConsoleLogger.error('Ошибка добавления в историю поиска', error as Error, { telegramId });
      throw AppError.databaseError('SEARCH_HISTORY_ADD_FAILED', 'Не удалось добавить запись в историю');
    }
  };

  public getSearchHistory = async (telegramId: number, limit = 10): Promise<TSearchHistoryItem[]> => {
    try {
      const entities = await this.db.query<TSearchHistoryEntity>(`
        SELECT * FROM search_history
        WHERE user_telegram_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [telegramId, limit]);

      // Для истории поиска нам нужны полные результаты, но они не хранятся в БД
      // Возвращаем упрощенную версию без results
      return entities.map(entity => ({
        id: entity.id,
        query: entity.query,
        structuredQuery: JSON.parse(entity.structured_query) as TSearchHistoryItem['structuredQuery'],
        results: entity.results ? JSON.parse(entity.results) as TSearchHistoryItem['results'] : [],
        timestamp: new Date(entity.created_at),
      }));
    } catch (error) {
      ConsoleLogger.error('Ошибка получения истории поиска', error as Error, { telegramId });
      throw AppError.databaseError('SEARCH_HISTORY_GET_FAILED', 'Не удалось получить историю поиска');
    }
  };

  public clearSearchHistory = async (telegramId: number): Promise<void> => {
    try {
      await this.db.run(`DELETE FROM search_history WHERE user_telegram_id = $1`, [telegramId]);
      ConsoleLogger.info('История поиска очищена', { telegramId });
    } catch (error) {
      ConsoleLogger.error('Ошибка очистки истории поиска', error as Error, { telegramId });
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
