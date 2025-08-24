import type { TDatabaseConnection } from '../types';

import { SQLitePool } from './SQLite';
import { MigrationRunner } from '../MigrationRunner';

// Глобальный пул соединений
export const databasePool = new SQLitePool();

export const createDatabaseConnection = async (): Promise<TDatabaseConnection> => {
  const connection = await databasePool.getConnection();

  const migrationRunner = new MigrationRunner(connection);
  // Run migrations on first connection
  await migrationRunner.runMigrations();

  return connection;
};
