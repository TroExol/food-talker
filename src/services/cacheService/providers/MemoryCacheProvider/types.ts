export interface TMemoryCacheItem<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}
