import { Pool } from 'pg';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type { TPostgreSQLConfig } from './types';
import type { TDatabaseConnection } from '../types';

export class PostgreSQL implements TDatabaseConnection {
  private pool: Pool;
  private isConnected = false;

  constructor(
    config: TPostgreSQLConfig,
  ) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.maxConnections,
    });

    this.pool.on('error', err => {
      if (err) {
        ConsoleLogger.error('Ошибка подключения к базе данных', err);
        throw AppError.databaseError('CONNECTION_FAILED', 'Не удалось подключиться к базе данных');
      }
      this.isConnected = true;
      ConsoleLogger.info('Подключение к базе данных установлено');
    });
  }

  public query = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> => {
    try {
      const client = await this.pool.connect();
      const result = await client.query(sql, params);
      client.release();
      return result.rows as T[];
    } catch (err) {
      ConsoleLogger.error('Ошибка выполнения запроса', err as Error, { sql, params });
      throw AppError.databaseError('QUERY_FAILED', (err as Error).message);
    }
  };

  public get = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`${sql} LIMIT 1`, params);
      client.release();
      return result.rows[0] as T | undefined;
    } catch (err) {
      ConsoleLogger.error('Ошибка выполнения запроса', err as Error, { sql, params });
      throw AppError.databaseError('QUERY_FAILED', (err as Error).message);
    }
  };

  public run = async (sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> => {
    try {
      const client = await this.pool.connect();
      const result = await client.query(sql, params);
      client.release();
      return {
        lastID: (result.rows[0] as { id?: number })?.id || 0,
        changes: result.rowCount || 0,
      };
    } catch (err) {
      ConsoleLogger.error('Ошибка выполнения запроса', err as Error, { sql, params });
      throw AppError.databaseError('QUERY_FAILED', (err as Error).message);
    }
  };

  public close = async (): Promise<void> => {
    if (!this.isConnected) return;

    try {
      await this.pool.end();
      this.isConnected = false;
      ConsoleLogger.info('Соединение с базой данных закрыто');
    } catch (err) {
      ConsoleLogger.error('Ошибка при закрытии соединения с базой данных', err as Error);
      throw AppError.databaseError('CLOSE_FAILED', (err as Error).message);
    }
  };
}
