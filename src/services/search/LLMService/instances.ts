import { redisCacheService } from '@/services/data/cache/cacheService/instances';

import { LLMService } from './LLMService';

export const llmService = new LLMService(redisCacheService);
