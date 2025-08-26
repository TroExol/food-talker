export interface TDatabaseConnection {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;
  get: <T = unknown>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  run: (sql: string, params?: unknown[]) => Promise<{ lastID: number; changes: number }>;
  close: () => Promise<void>;
}

export interface TDatabasePool {
  getConnection: () => Promise<TDatabaseConnection>;
  closeAll: () => Promise<void>;
  getActiveConnections: () => number;
}

export interface TMigration {
  version: number;
  description: string;
  up: (db: TDatabaseConnection) => Promise<void>;
  down: (db: TDatabaseConnection) => Promise<void>;
}
