import type { TCacheConfig } from '@/config/bot/types';

export interface TCacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  getStats(): Promise<TCacheStats>;
  close(): Promise<void>;
}

export interface TCacheStats {
  totalKeys: number;
  memoryUsage: number; // bytes
  hitRate: number; // 0-1
  missRate: number; // 0-1
}

export type TCacheServiceConfig = { type: 'memory' | 'redis' } & TCacheConfig;
