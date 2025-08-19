import Database from 'sqlite3';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

import { environment } from './environment';

export interface TDatabaseConnection {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ lastID: number; changes: number }>;
  close(): Promise<void>;
}

export interface TDatabasePool {
  getConnection(): Promise<TDatabaseConnection>;
  closeAll(): Promise<void>;
  getActiveConnections(): number;
}

class SQLiteConnection implements TDatabaseConnection {
  private db: Database.Database;
  private isConnected = false;

  constructor(dbPath: string) {
    this.db = new Database.Database(dbPath, err => {
      if (err) {
        logger.error('Ошибка подключения к базе данных', err);
        throw AppError.databaseError('CONNECTION_FAILED', 'Не удалось подключиться к базе данных');
      }
      this.isConnected = true;
      logger.info('Подключение к базе данных установлено');
    });
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Ошибка выполнения запроса', err, { sql, params });
          reject(AppError.databaseError('QUERY_FAILED', err.message));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('Ошибка выполнения запроса', err, { sql, params });
          reject(AppError.databaseError('QUERY_FAILED', err.message));
        } else {
          resolve(row as T | undefined);
        }
      });
    });
  }

  async run(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          logger.error('Ошибка выполнения запроса', err, { sql, params });
          reject(AppError.databaseError('QUERY_FAILED', err.message));
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.isConnected) return;

    return new Promise((resolve, reject) => {
      this.db.close(err => {
        if (err) {
          logger.error('Ошибка закрытия соединения с БД', err);
          reject(err);
        } else {
          this.isConnected = false;
          logger.info('Соединение с базой данных закрыто');
          resolve();
        }
      });
    });
  }
}

class DatabasePool implements TDatabasePool {
  private connections: SQLiteConnection[] = [];
  private maxConnections: number;
  private currentConnections = 0;

  constructor(maxConnections = 10) {
    this.maxConnections = maxConnections;
  }

  getConnection(): Promise<TDatabaseConnection> {
    if (this.currentConnections < this.maxConnections) {
      const connection = new SQLiteConnection(environment.DATABASE_URL);
      this.connections.push(connection);
      this.currentConnections++;
      return Promise.resolve(connection);
    }

    // Простая стратегия - возвращаем первое доступное соединение
    return Promise.resolve(this.connections[0]);
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.connections.map(conn => conn.close()));
    this.connections = [];
    this.currentConnections = 0;
    logger.info('Все соединения с базой данных закрыты');
  }

  getActiveConnections(): number {
    return this.currentConnections;
  }
}

// Глобальный пул соединений
export const databasePool = new DatabasePool();

export async function createDatabaseConnection(): Promise<TDatabaseConnection> {
  const connection = await databasePool.getConnection();

  // Run migrations on first connection
  await runMigrations(connection);

  return connection;
}

export async function runMigrations(db: TDatabaseConnection): Promise<void> {
  const { MigrationRunner } = await import('./migrations');
  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runMigrations();
}
