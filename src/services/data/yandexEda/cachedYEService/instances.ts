import { redisCacheService } from '@/services/data/cache/cacheService/instances';

import { CachedYEService } from './CachedYEService';
import { yeService } from '../yeService/instances';
import { yeDataTransformer } from '../yeDataTransformer/instances';

export const cachedYeService = new CachedYEService(
  yeService,
  redisCacheService,
  yeDataTransformer,
);
