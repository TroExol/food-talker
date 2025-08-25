import { redisCacheService } from '@/services/cacheService/instances';

import { LLMService } from './LLMService';

export const llmService = new LLMService(redisCacheService, {
  model: 'unsloth/Qwen3-4B-GGUF',
  systemPrompt: 'Ты - помощник для поиска еды. Reasoning: low',
});
