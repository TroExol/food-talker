import { CacheService } from './CacheService';

export class CacheServiceFactory {
  private static memoryInstance: CacheService | null = null;
  private static redisInstance: CacheService | null = null;

  static getMemoryInstance = (): CacheService => {
    if (!CacheServiceFactory.memoryInstance) {
      CacheServiceFactory.memoryInstance = new CacheService({
        ttl: 3600,
        maxSize: 100000,
        type: 'memory',
      });
    }
    return CacheServiceFactory.memoryInstance;
  };

  static getRedisInstance = (): CacheService => {
    if (!CacheServiceFactory.redisInstance) {
      CacheServiceFactory.redisInstance = new CacheService({
        ttl: 3600,
        maxSize: 100000,
        type: 'redis',
      });
    }
    return CacheServiceFactory.redisInstance;
  };
}
