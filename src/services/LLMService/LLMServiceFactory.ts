import { CacheServiceFactory } from '@/services/cacheService/CacheServiceFactory';

import { LLMService } from './LLMService';

export class LLMServiceFactory {
  private static instance: LLMService | null = null;

  static getInstance = (): LLMService => {
    if (!LLMServiceFactory.instance) {
      LLMServiceFactory.instance = new LLMService(
        CacheServiceFactory.getRedisInstance(),
        {
          model: 'qwen/qwen3-4b-2507',
          systemPrompt: 'Ты - помощник для поиска еды. Reasoning: low',
          timeoutMs: 40000,
        },
      );
    }
    return LLMServiceFactory.instance;
  };
}
