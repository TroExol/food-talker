import { sqlitePool } from '@/services/database/SQLite/instances';

import type { TDatabaseConnection } from '../types';

import { MigrationRunner } from '../MigrationRunner';

export class SQLiteFactory {
  private static instance: TDatabaseConnection | null = null;

  static getInstance = async (): Promise<TDatabaseConnection> => {
    if (!SQLiteFactory.instance) {
      const connection = await sqlitePool.getConnection();
      SQLiteFactory.instance = connection;
      const migrationRunner = new MigrationRunner(connection);
      // Run migrations on first connection
      await migrationRunner.runMigrations();
    }

    return SQLiteFactory.instance;
  };

  static resetInstance = (): void => {
    SQLiteFactory.instance = null;
  };
}
