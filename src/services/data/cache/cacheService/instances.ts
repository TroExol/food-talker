import { botConfig } from '@/config/bot';

import { CacheService } from './CacheService';

export const memoryCacheService = new CacheService({
  ttl: botConfig.cache.ttl,
  maxSize: botConfig.cache.maxSize,
  type: 'memory',
});

export const redisCacheService = new CacheService({
  ttl: botConfig.cache.ttl,
  maxSize: botConfig.cache.maxSize,
  type: 'redis',
  redisUrl: botConfig.cache.redisUrl,
});
