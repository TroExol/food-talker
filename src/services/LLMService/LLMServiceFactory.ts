import { CacheServiceFactory } from '@/services/cacheService/CacheServiceFactory';

import { LLMService } from './LLMService';

export class LLMServiceFactory {
  private static instance: LLMService | null = null;

  static getInstance = (): LLMService => {
    if (!LLMServiceFactory.instance) {
      LLMServiceFactory.instance = new LLMService(
        CacheServiceFactory.getRedisInstance(),
        {
          model: 'unsloth/gpt-oss-20b-GGUF',
          systemPrompt: 'Ты - помощник для поиска еды. Reasoning: low',
          timeoutMs: 40000,
        },
      );
    }
    return LLMServiceFactory.instance;
  };
}
