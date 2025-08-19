import { createDatabaseConnection, databasePool } from '@/config/database';

import { logger } from './logger';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private isInitialized = false;

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Создаем первое соединение и запускаем миграции
      await createDatabaseConnection();
      this.isInitialized = true;
      logger.info('База данных успешно инициализирована');
    } catch (error) {
      logger.error('Ошибка инициализации базы данных', error as Error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      await databasePool.closeAll();
      this.isInitialized = false;
      logger.info('База данных корректно закрыта');
    } catch (error) {
      logger.error('Ошибка при закрытии базы данных', error as Error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const databaseManager = DatabaseManager.getInstance();
