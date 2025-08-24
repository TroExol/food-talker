import { SQLitePool } from './SQLite';

// Глобальный пул соединений
export const sqlitePool = new SQLitePool(1);
