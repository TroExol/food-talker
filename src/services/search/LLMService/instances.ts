import { redisCacheService } from '@/services/cacheService/instances';

import { LLMService } from './LLMService';

export const llmService = new LLMService(redisCacheService);
