import { cityValidator } from '@/utils/cityValidator';
import { redisCacheService } from '@/services/cacheService/instances';

import { YEApiService } from './YEApiService';
import { yeDataTransformer } from '../yeDataTransformer/instances';

export const yeApiService = new YEApiService(
  redisCacheService,
  yeDataTransformer,
  cityValidator,
);
