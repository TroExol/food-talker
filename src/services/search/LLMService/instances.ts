import { redisCacheService } from '@/services/cacheService/instances';

import { LLMService } from './LLMService';

export const llmService = new LLMService(redisCacheService, {
  model: 'qwen/qwen3-4b-2507',
  systemPrompt: 'Ты - помощник для поиска еды. Reasoning: low',
  timeoutMs: 40000,
});
