import Database from 'sqlite3';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type { TDatabaseConnection, TDatabasePool } from '../types';

import { environment } from '../../../config/environment';

class SQLite implements TDatabaseConnection {
  private db: Database.Database;
  private isConnected = false;

  constructor(dbPath: string) {
    this.db = new Database.Database(dbPath, err => {
      if (err) {
        ConsoleLogger.error('Ошибка подключения к базе данных', err);
        throw AppError.databaseError('CONNECTION_FAILED', 'Не удалось подключиться к базе данных');
      }
      this.isConnected = true;
      ConsoleLogger.info('Подключение к базе данных установлено');
    });
  }

  public query = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          ConsoleLogger.error('Ошибка выполнения запроса', err, { sql, params });
          reject(AppError.databaseError('QUERY_FAILED', err.message));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  };

  public get = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          ConsoleLogger.error('Ошибка выполнения запроса', err, { sql, params });
          reject(AppError.databaseError('QUERY_FAILED', err.message));
        } else {
          resolve(row as T | undefined);
        }
      });
    });
  };

  public run = async (sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> => {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          ConsoleLogger.error('Ошибка выполнения запроса', err, { sql, params });
          reject(AppError.databaseError('QUERY_FAILED', err.message));
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  };

  public close = async (): Promise<void> => {
    if (!this.isConnected) return;

    return new Promise((resolve, reject) => {
      this.db.close(err => {
        if (err) {
          ConsoleLogger.error('Ошибка закрытия соединения с БД', err);
          reject(err);
        } else {
          this.isConnected = false;
          ConsoleLogger.info('Соединение с базой данных закрыто');
          resolve();
        }
      });
    });
  };
}

export class SQLitePool implements TDatabasePool {
  private connections: SQLite[] = [];
  private maxConnections: number;
  private currentConnections = 0;

  constructor(maxConnections = 10) {
    this.maxConnections = maxConnections;
  }

  public getConnection = (): Promise<TDatabaseConnection> => {
    if (this.currentConnections < this.maxConnections) {
      const connection = new SQLite(environment.DATABASE_URL);
      this.connections.push(connection);
      this.currentConnections++;
      return Promise.resolve(connection);
    }

    // Простая стратегия - возвращаем первое доступное соединение
    return Promise.resolve(this.connections[0]);
  };

  public closeAll = async (): Promise<void> => {
    await Promise.all(this.connections.map(conn => conn.close()));
    this.connections = [];
    this.currentConnections = 0;
    ConsoleLogger.info('Все соединения с базой данных закрыты');
  };

  public getActiveConnections = (): number => {
    return this.currentConnections;
  };
}
