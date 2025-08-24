import { cityValidator } from '@/utils/cityValidator';
import { redisCacheService } from '@/services/cacheService/instances';

import { YESearchService } from './YESearchService';
import { yeApiService } from '../yeApiService/instances';

export const yeSearchService = new YESearchService(
  yeApiService,
  redisCacheService,
  cityValidator,
);
