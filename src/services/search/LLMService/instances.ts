import { redisCacheService } from '@/services/cacheService/instances';

import { LLMService } from './LLMService';

export const llmService = new LLMService(redisCacheService, {
  model: 'unsloth/gpt-oss-20b-GGUF',
  systemPrompt: 'Ты - помощник для поиска еды. Reasoning: low',
});
