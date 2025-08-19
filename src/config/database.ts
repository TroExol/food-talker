import Database from 'sqlite3';

import { environment } from './environment';

export interface TDatabaseConnection {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ lastID: number; changes: number }>;
  close(): Promise<void>;
}

class SQLiteConnection implements TDatabaseConnection {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database.Database(dbPath);
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  async run(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export async function createDatabaseConnection(): Promise<TDatabaseConnection> {
  const connection = new SQLiteConnection(environment.DATABASE_URL);

  // Initialize database schema
  await initializeSchema(connection);

  return connection;
}

async function initializeSchema(db: TDatabaseConnection): Promise<void> {
  // Users table
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      city TEXT NOT NULL,
      subscription_type TEXT NOT NULL DEFAULT 'basic',
      subscription_expiry DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1
    )
  `);
}
