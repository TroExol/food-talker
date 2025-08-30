import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type { TDatabaseConnection, TMigration } from './types';

export class MigrationRunner {
  constructor(private db: TDatabaseConnection) {}

  /**
   * Создает копию таблицы с данными
   * @param sourceTable - исходная таблица
   * @param targetTable - целевая таблица
   */
  public copyTableWithData = async (sourceTable: string, targetTable: string): Promise<void> => {
    try {
      ConsoleLogger.info(`Создание копии таблицы ${sourceTable} -> ${targetTable} с данными`);

      await this.db.run(`CREATE TABLE IF NOT EXISTS ${targetTable} AS SELECT * FROM ${sourceTable}`);

      ConsoleLogger.info(`Таблица ${targetTable} успешно создана с данными из ${sourceTable}`);
    } catch (error) {
      ConsoleLogger.error(`Ошибка создания копии таблицы ${sourceTable}`, error as Error);
      throw AppError.databaseError('COPY_TABLE_FAILED', `Не удалось создать копию таблицы ${sourceTable}`);
    }
  };

  /**
   * Создает копию структуры таблицы без данных
   * @param sourceTable - исходная таблица
   * @param targetTable - целевая таблица
   */
  public copyTableStructure = async (sourceTable: string, targetTable: string): Promise<void> => {
    try {
      ConsoleLogger.info(`Создание копии структуры таблицы ${sourceTable} -> ${targetTable}`);

      await this.db.run(`CREATE TABLE IF NOT EXISTS ${targetTable} (LIKE ${sourceTable} INCLUDING ALL)`);

      ConsoleLogger.info(`Структура таблицы ${targetTable} успешно создана из ${sourceTable}`);
    } catch (error) {
      ConsoleLogger.error(`Ошибка создания копии структуры таблицы ${sourceTable}`, error as Error);
      throw AppError.databaseError('COPY_STRUCTURE_FAILED', `Не удалось создать копию структуры таблицы ${sourceTable}`);
    }
  };

  /**
   * Создает резервную копию таблицы с временной меткой
   * @param tableName - имя таблицы для резервного копирования
   */
  public createBackupTable = async (tableName: string): Promise<string> => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupTableName = `${tableName}_backup_${timestamp}`;

    try {
      ConsoleLogger.info(`Создание резервной копии таблицы ${tableName} -> ${backupTableName}`);

      await this.copyTableWithData(tableName, backupTableName);

      ConsoleLogger.info(`Резервная копия ${backupTableName} успешно создана`);
      return backupTableName;
    } catch (error) {
      ConsoleLogger.error(`Ошибка создания резервной копии таблицы ${tableName}`, error as Error);
      throw AppError.databaseError('BACKUP_FAILED', `Не удалось создать резервную копию таблицы ${tableName}`);
    }
  };

  public createBackupTables = async (): Promise<void> => {
    try {
      await this.copyTableWithData('users', 'users_backup');
      await this.copyTableWithData('dishes', 'dishes_backup');
      await this.copyTableWithData('neural_request_logs', 'neural_request_logs_backup');
      await this.copyTableWithData('api_request_logs', 'api_request_logs_backup');
    } catch (error) {
      ConsoleLogger.error('Ошибка создания резервных копий таблиц', error as Error);
      throw AppError.databaseError('BACKUP_FAILED', 'Не удалось создать резервные копии таблиц');
    }
  };

  /**
   * Восстанавливает таблицу из резервной копии
   * @param backupTableName - имя резервной таблицы
   * @param targetTableName - имя целевой таблицы (если не указано, используется оригинальное имя)
   */
  public restoreFromBackup = async (backupTableName: string, targetTableName?: string): Promise<void> => {
    const targetTable = targetTableName || backupTableName.replace(/_backup_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '');

    try {
      ConsoleLogger.info(`Восстановление таблицы ${targetTable} из резервной копии ${backupTableName}`);

      // Удаляем существующую таблицу если она есть
      await this.db.run(`DROP TABLE IF EXISTS ${targetTable}`);

      // Создаем таблицу из резервной копии
      await this.copyTableWithData(backupTableName, targetTable);

      ConsoleLogger.info(`Таблица ${targetTable} успешно восстановлена из ${backupTableName}`);
    } catch (error) {
      ConsoleLogger.error(`Ошибка восстановления таблицы из ${backupTableName}`, error as Error);
      throw AppError.databaseError('RESTORE_FAILED', `Не удалось восстановить таблицу из ${backupTableName}`);
    }
  };

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

  public runDownMigrations = async (): Promise<void> => {
    // Получаем текущую версию
    const currentVersion = await this.getCurrentVersion();

    // Запускаем все миграции начиная с текущей версии
    for (const migration of migrations.reverse()) {
      if (migration.version <= currentVersion) {
        await this.runDownMigration(migration);
      }
    }
  };

  private createMigrationsTable = async (): Promise<void> => {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT DEFAULT now()
      )
    `);
  };

  private getCurrentVersion = async (): Promise<number> => {
    try {
      const result = await this.db.get<{ version: number }>(`
        SELECT version FROM migrations ORDER BY version DESC
      `);
      return result?.version || 0;
    } catch (error) {
      ConsoleLogger.error('Ошибка получения текущей версии миграций', error as Error);
      return 0;
    }
  };

  private runMigration = async (migration: TMigration): Promise<void> => {
    try {
      ConsoleLogger.info(`Применение миграции ${migration.version}: ${migration.description}`);

      await migration.up(this.db);

      await this.db.run(`
        INSERT INTO migrations (version, description) VALUES ($1, $2)
      `, [migration.version, migration.description]);

      ConsoleLogger.info(`Миграция ${migration.version} успешно применена`);
    } catch (error) {
      ConsoleLogger.error(`Ошибка применения миграции ${migration.version}`, error as Error);
      throw AppError.databaseError('MIGRATION_FAILED', `Не удалось применить миграцию ${migration.version}`);
    }
  };

  private runDownMigration = async (migration: TMigration): Promise<void> => {
    try {
      ConsoleLogger.info(`Откат миграции ${migration.version}: ${migration.description}`);

      await migration.down(this.db);

      await this.db.run(`
        DELETE FROM migrations WHERE version = $1
      `, [migration.version]);
    } catch (error) {
      ConsoleLogger.error(`Ошибка отката миграции ${migration.version}`, error as Error);
      throw AppError.databaseError('MIGRATION_FAILED', `Не удалось откатить миграцию ${migration.version}`);
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
          created_at TEXT DEFAULT now(),
          updated_at TEXT DEFAULT now()
        )
      `);

      // Search history table
      await db.run(`
        CREATE TABLE IF NOT EXISTS search_history (
          id TEXT PRIMARY KEY,
          user_telegram_id INTEGER NOT NULL,
          query TEXT NOT NULL,
          structured_query JSONB NOT NULL,
          results JSONB NOT NULL,
          created_at TEXT DEFAULT now(),
          FOREIGN KEY (user_telegram_id) REFERENCES users (telegram_id)
        )
      `);

      // Создаем расширение pgvector (только для PostgreSQL)
      await db.run('CREATE EXTENSION IF NOT EXISTS vector');

      // Создаем таблицу для блюд с векторами
      await db.run(`
        CREATE TABLE IF NOT EXISTS dishes (
          id VARCHAR(255) PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          ingredients TEXT,
          price INTEGER NOT NULL,
          image TEXT NOT NULL,
          available BOOLEAN DEFAULT true,
          restaurant_id VARCHAR(255) NOT NULL,
          restaurant_name TEXT NOT NULL,
          restaurant_latitude DECIMAL(10, 8) NOT NULL,
          restaurant_longitude DECIMAL(11, 8) NOT NULL,
          order_url TEXT NOT NULL,
          category VARCHAR(50) NOT NULL,
          embedding vector(1024),
          expires_at TIMESTAMP NOT NULL,
          created_at TEXT DEFAULT now(),
          updated_at TEXT DEFAULT now()
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS neural_request_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_telegram_id INTEGER,
          request_type TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          request_data JSONB,
          response_data JSONB,
          processing_time_ms INTEGER,
          created_at TIMESTAMP DEFAULT now(),
          FOREIGN KEY (user_telegram_id) REFERENCES users (telegram_id)
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS api_request_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_telegram_id INTEGER,
          request_type TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          request_data JSONB,
          response_data JSONB,
          processing_time_ms INTEGER NOT NULL,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT now(),
          FOREIGN KEY (user_telegram_id) REFERENCES users (telegram_id)
        )
      `);

      // Пользователи
      await db.run(`CREATE INDEX IF NOT EXISTS idx_users_city ON users(city)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_telegram_id)`);
      // Блюда
      await db.run('CREATE INDEX IF NOT EXISTS dishes_category_idx ON dishes(category)');
      await db.run('CREATE INDEX IF NOT EXISTS dishes_restaurant_id_idx ON dishes(restaurant_id)');
      await db.run('CREATE INDEX IF NOT EXISTS dishes_available_idx ON dishes(available)');
      await db.run('CREATE INDEX IF NOT EXISTS dishes_price_idx ON dishes(price)');
      await db.run('CREATE INDEX IF NOT EXISTS dishes_coordinates_idx ON dishes(restaurant_latitude, restaurant_longitude)');
      await db.run('CREATE INDEX IF NOT EXISTS dishes_expires_at_idx ON dishes(expires_at)');
      // Логирование запросов к нейронным моделям
      await db.run('CREATE INDEX IF NOT EXISTS neural_logs_user_idx ON neural_request_logs(user_telegram_id)');
      await db.run('CREATE INDEX IF NOT EXISTS neural_logs_type_idx ON neural_request_logs(request_type)');
      await db.run('CREATE INDEX IF NOT EXISTS neural_logs_created_at_idx ON neural_request_logs(created_at)');
      await db.run('CREATE INDEX IF NOT EXISTS neural_logs_user_type_idx ON neural_request_logs(user_telegram_id, request_type)');
      // Логирование запросов к API
      await db.run('CREATE INDEX IF NOT EXISTS api_logs_user_idx ON api_request_logs(user_telegram_id)');
      await db.run('CREATE INDEX IF NOT EXISTS api_logs_type_idx ON api_request_logs(request_type)');
      await db.run('CREATE INDEX IF NOT EXISTS api_logs_endpoint_idx ON api_request_logs(endpoint)');
      await db.run('CREATE INDEX IF NOT EXISTS api_logs_status_code_idx ON api_request_logs(status_code)');
      await db.run('CREATE INDEX IF NOT EXISTS api_logs_created_at_idx ON api_request_logs(created_at)');
      await db.run('CREATE INDEX IF NOT EXISTS api_logs_user_type_idx ON api_request_logs(user_telegram_id, request_type)');
      await db.run('CREATE INDEX IF NOT EXISTS api_logs_failed_requests_idx ON api_request_logs(user_telegram_id, status_code) WHERE status_code >= 400');
    },
    down: async db => {
      await db.run('DROP TABLE IF EXISTS neural_request_logs');
      await db.run('DROP TABLE IF EXISTS api_request_logs');
      await db.run('DROP TABLE IF EXISTS dishes');
      await db.run('DROP TABLE IF EXISTS search_history');
      await db.run('DROP TABLE IF EXISTS users');
    },
  },
];
