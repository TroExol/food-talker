import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

import type { TDatabaseConnection } from './database';

export interface TMigration {
  version: number;
  description: string;
  up: (db: TDatabaseConnection) => Promise<void>;
  down: (db: TDatabaseConnection) => Promise<void>;
}

export class MigrationRunner {
  constructor(private db: TDatabaseConnection) {}

  public runMigrations = async (): Promise<void> => {
    // Создаем таблицу миграций если её нет
    await this.createMigrationsTable();

    // Получаем текущую версию
    const currentVersion = await this.getCurrentVersion();

    // Запускаем все миграции начиная с текущей версии
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        await this.runMigration(migration);
      }
    }
  };

  private createMigrationsTable = async (): Promise<void> => {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `);
  };

  private getCurrentVersion = async (): Promise<number> => {
    const result = await this.db.get<{ version: number }>(`
      SELECT version FROM migrations ORDER BY version DESC LIMIT 1
    `);
    return result?.version || 0;
  };

  private runMigration = async (migration: TMigration): Promise<void> => {
    try {
      logger.info(`Применение миграции ${migration.version}: ${migration.description}`);

      await migration.up(this.db);

      await this.db.run(`
        INSERT INTO migrations (version, description) VALUES (?, ?)
      `, [migration.version, migration.description]);

      logger.info(`Миграция ${migration.version} успешно применена`);
    } catch (error) {
      logger.error(`Ошибка применения миграции ${migration.version}`, error as Error);
      throw AppError.databaseError('MIGRATION_FAILED', `Не удалось применить миграцию ${migration.version}`);
    }
  };
}

const migrations: TMigration[] = [
  {
    version: 1,
    description: 'Создание базовых таблиц',
    up: async db => {
      // Users table
      await db.run(`
        CREATE TABLE IF NOT EXISTS users (
          telegram_id INTEGER PRIMARY KEY,
          chat_id INTEGER NOT NULL,
          city TEXT NOT NULL,
          subscription_type TEXT NOT NULL DEFAULT 'basic',
          subscription_expiry TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Search history table
      await db.run(`
        CREATE TABLE IF NOT EXISTS search_history (
          id TEXT PRIMARY KEY,
          user_telegram_id INTEGER NOT NULL,
          query TEXT NOT NULL,
          structured_query TEXT NOT NULL,
          results_count INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_telegram_id) REFERENCES users (telegram_id)
        )
      `);

      // Restaurant cache table
      await db.run(`
        CREATE TABLE IF NOT EXISTS restaurant_cache (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          data TEXT NOT NULL,
          city TEXT NOT NULL,
          last_updated TEXT DEFAULT (datetime('now')),
          is_active INTEGER DEFAULT 1
        )
      `);

      // Индексы для производительности
      await db.run(`CREATE INDEX IF NOT EXISTS idx_users_city ON users(city)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_telegram_id)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_restaurant_cache_city ON restaurant_cache(city, is_active)`);
    },
    down: async db => {
      await db.run('DROP TABLE IF EXISTS restaurant_cache');
      await db.run('DROP TABLE IF EXISTS search_history');
      await db.run('DROP TABLE IF EXISTS users');
    },
  },
];

export { migrations };
