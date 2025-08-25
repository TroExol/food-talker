import { vectorSyncService } from '@/services/vectorSearch/instances';
import { redisCacheService } from '@/services/cacheService/instances';

import { YEApiService } from './YEApiService';
import { yeDataTransformer } from '../yeDataTransformer/instances';

export const yeApiService = new YEApiService(
  redisCacheService,
  yeDataTransformer,
  vectorSyncService,
);
