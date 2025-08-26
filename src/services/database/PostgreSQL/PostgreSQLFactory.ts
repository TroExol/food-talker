import { environment } from '@/config/environment';

import { PostgreSQL } from './PostgreSQL';
import { MigrationRunner } from '../MigrationRunner';

export class PostgreSQLFactory {
  private static instance: PostgreSQL | null = null;

  static getInstance = async (): Promise<PostgreSQL> => {
    if (!PostgreSQLFactory.instance) {
      const connection = new PostgreSQL({
        host: environment.DB_HOST,
        port: parseInt(environment.DB_PORT, 10),
        database: environment.DB_NAME,
        user: environment.DB_USER,
        password: environment.DB_PASSWORD,
        maxConnections: parseInt(environment.DB_MAX_CONNECTIONS, 10),
      });
      PostgreSQLFactory.instance = connection;
      const migrationRunner = new MigrationRunner(connection);
      // Run migrations on first connection
      await migrationRunner.runMigrations();
    }

    return PostgreSQLFactory.instance;
  };

  static resetInstance = (): void => {
    PostgreSQLFactory.instance = null;
  };
}
